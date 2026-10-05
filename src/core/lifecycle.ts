// The commands behind the CLI and the TUI.
//
// Each `cmd*` is one user-visible action and is idempotent: running it twice is
// safe. Destructive actions confirm first, and every external command goes
// through `exec`, so `--dry-run` covers the whole surface.
//
// docs: docs/managing.md

import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { buildApp, bundleRuntimeReady } from "./bundle.ts";
import { type Config, loadConfig } from "./config.ts";
import { clearStaleDepotState, gameInstalled, importDepot, updateStatus, waitForDepotDownload } from "./depot.ts";
import { detectExecutable } from "./exe.ts";
import { exec, isDryRun, which } from "./exec.ts";
import { exists, mkdirp, readText, remove, writeBytes, writeText } from "./fsx.ts";
import { type GamePaths, resolveGamePaths, WINDOWS_STEAM_ARG, windowsSteamExe } from "./game.ts";
import { provisionIcon } from "./icon.ts";
import { readPe } from "./pe.ts";
import { lutrisLookup } from "./lutris.ts";
import { downloadGogBuild, ensureGogToken, gogBuffer, gogDownloadDir, gogPrimaryExecutable, gogProduct, windowsInstallers } from "./gog.ts";
import { ensureQuitHotkey } from "./hotkey.ts";
import { die, heading, log, warn } from "./log.ts";
import { gameAssetsDir, gameDir, logsDir } from "./paths.ts";
import type { GameProfile, RuntimeSnapshot } from "./profile.ts";
import { getGame, saveGame } from "./registry.ts";
import { downloadDepot, ensureSteamcmd } from "./steamcmd.ts";
import type { WineRuntime } from "./wine.ts";
import {
  clearQuarantine,
  ensureWine,
  installedWineVersions,
  latestWineVersion,
  readD3dMetalVersion,
  resolveWine,
  runtimeDetails,
  runtimeVersion,
  wineboot,
} from "./wine.ts";

/** A game plus everything derived from it. */
export interface GameContext {
  profile: GameProfile;
  paths: GamePaths;
  wine: WineRuntime;
  config: Config;
}

/** Load config, profile, paths and runtime for one game. */
export async function loadContext(slug: string): Promise<GameContext> {
  const config = await loadConfig();
  const profile = await getGame(slug);
  return {
    config,
    profile,
    paths: resolveGamePaths(profile, config),
    wine: resolveWine(profile, config),
  };
}

// --- setup --------------------------------------------------------------------

/** Install Rosetta, the Wine runtime, the prefix, the icon and the app bundle. */
export async function cmdSetup(slug: string): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  log(`${profile.name} — setup (idempotent, safe to re-run)`);

  if (process.arch !== "arm64") {
    warn(`this tool targets Apple Silicon; detected ${process.arch}`);
  }
  const major = Number.parseInt((await exec("sw_vers", ["-productVersion"])).stdout.split(".")[0] ?? "0", 10);
  if (major < profile.minMacos) {
    warn(`macOS ${major} is older than the supported minimum (${profile.minMacos})`);
  }

  await ensureRosetta();
  await ensureWine(wine);
  await clearQuarantine(wine);
  await ensureSteamcmd();
  await wineboot(wine, paths.prefix);
  await applyWineTricks(profile, paths, wine);
  await ensureQuitHotkey();

  const assets = gameAssetsDir(profile.slug);
  if (!exists(join(assets, "icon.icns"))) {
    await provisionIcon(profile, assets, { exePath: join(paths.gameDir, profile.exe) });
  }

  await buildApp(profile, paths, wine);
  await recordRuntimeSnapshot(profile, wine);

  heading("next steps:");
  log(`1. download the Windows build:  steam-mac download ${slug}`);
  log(`2. import it:                    steam-mac import ${slug}`);
  log(`3. play:                         steam-mac run ${slug}   (or open '${paths.app}')`);
}

async function ensureRosetta(): Promise<void> {
  const installed = (await exec("pgrep", ["-q", "oahd"], { allowFailure: true })).status === 0;
  if (installed) {
    log("rosetta 2: already installed");
    return;
  }
  log("rosetta 2: installing");
  await exec("softwareupdate", ["--install-rosetta", "--agree-to-license"]);
}

// --- import / download / update -----------------------------------------------

/** Move a finished depot download into the prefix. */
export async function cmdImport(slug: string, options: { manifest?: string; installer?: string } = {}): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  if (options.installer) {
    if (await isGameRunning(profile)) {
      die("the game is running — close it before importing");
    }
    await runGogInstaller(profile, paths, wine, options.installer);
    log(`done. play with: steam-mac run ${slug}`);
    return;
  }
  if (profile.store === "gog") {
    if (profile.gogId === 0) {
      die("no GOG product id configured — set 'gogId' in game.json");
    }
    if (await isGameRunning(profile)) {
      die("the game is running — close it before importing");
    }
    await importGog(profile, paths, wine);
    log(`done. play with: steam-mac run ${slug}`);
    return;
  }
  if (profile.depot === 0) {
    die("no Steam depot id configured — set 'depot' in game.json");
  }
  if (await isGameRunning(profile)) {
    die("the game is running — close it before importing");
  }

  if (await finalizeImport(profile, paths, wine, options.manifest)) {
    log(`done. play with: steam-mac run ${slug}`);
  }
}

/** Download the newest GOG build and import it into the prefix. */
async function downloadGog(profile: GameProfile, paths: GamePaths, wine: WineRuntime): Promise<void> {
  const token = await ensureGogToken();
  const dest = gogDownloadDir(profile.slug);

  // Design B: the Galaxy content-system build.
  try {
    log(`gog: downloading product ${profile.gogId} (content-system build)`);
    const root = await downloadGogBuild(profile.gogId, dest, {
      token,
      onProgress: (message) => log(`gog: ${message}`),
    });
    await writeText(join(dest, ".steam-mac-root"), `${root}\n`);
    await importGog(profile, paths, wine);
    return;
  } catch (error) {
    warn(`GOG content-system download failed: ${(error as Error).message}`);
  }

  // Design A: the offline installer.
  try {
    const installer = await downloadGogInstaller(profile.gogId, profile.slug, dest, token);
    await runGogInstaller(profile, paths, wine, installer);
    return;
  } catch (error) {
    warn(`GOG offline installer failed: ${(error as Error).message}`);
  }

  die(
    `could not download the GOG build — download the offline installer yourself, then run: steam-mac import ${profile.slug} --installer <setup.exe>`,
  );
}

/** Fetch a product's newest Windows offline installer (Design A). */
async function downloadGogInstaller(gogId: number, slug: string, dest: string, token: string): Promise<string> {
  const product = await gogProduct(gogId, token);
  const installers = windowsInstallers(product);
  if (installers.length === 0) {
    die(`no Windows offline installer for GOG product ${gogId}`);
  }
  const installer = installers.find((entry) => entry.language === "en") ?? installers[0]!;
  const files = installer.files;
  if (files.length === 0) {
    die(`the GOG installer for ${gogId} has no files`);
  }

  // The downlink has no filename header, so build the Inno Setup names: the
  // first file is the `.exe`, the rest are the `-N.bin` parts next to it.
  await mkdirp(dest);
  const exe = join(dest, `setup_${slug}.exe`);
  log(`gog: downloading ${basename(exe)}`);
  await writeBytes(exe, await gogBuffer(files[0]!.downlink, token));
  for (let index = 1; index < files.length; index += 1) {
    const part = join(dest, `setup_${slug}-${index}.bin`);
    log(`gog: downloading ${basename(part)}`);
    await writeBytes(part, await gogBuffer(files[index]!.downlink, token));
  }
  return exe;
}

/** Run a GOG offline installer inside the prefix (Design A / BYOI). */
async function runGogInstaller(
  profile: GameProfile,
  paths: GamePaths,
  wine: WineRuntime,
  installer: string,
): Promise<void> {
  if (!exists(installer)) {
    die(`installer not found: ${installer}`);
  }
  log(`running the GOG installer in the prefix: ${installer}`);
  await mkdirp(paths.gameDir);
  const result = await exec(
    wine.distExe,
    ["/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", `/DIR=C:\\${profile.installSubdir}`, "/NOICONS", installer],
    { cwd: paths.gameDir, env: { WINEPREFIX: paths.prefix }, allowFailure: true },
  );
  if (result.status !== 0) {
    warn(`the installer exited with ${result.status} — check the output above`);
  }
  await ensureExecutable(profile, paths, wine);
}

/** Move a downloaded GOG build into the prefix and detect the executable. */
async function importGog(profile: GameProfile, paths: GamePaths, wine: WineRuntime): Promise<void> {
  const dest = gogDownloadDir(profile.slug);
  const root = (await readText(join(dest, ".steam-mac-root")))?.trim() ?? "";
  if (!root || !exists(root)) {
    die(`nothing to import: no GOG build in ${dest} — run: steam-mac download ${profile.slug}`);
  }
  log(`importing GOG build: ${root} → ${paths.gameDir}`);
  await mkdirp(paths.gameDir);
  await exec("rsync", ["-a", `${root}/`, `${paths.gameDir}/`]);

  // Prefer the entry point the build declares over guessing by size.
  const primary = await gogPrimaryExecutable(paths.gameDir, profile.gogId);
  if (primary && primary !== profile.exe) {
    log(`gog: using the declared executable '${primary}'`);
    profile.exe = primary;
    await saveGame(profile);
    await buildApp(profile, paths, wine);
  } else {
    await ensureExecutable(profile, paths, wine);
  }
  await applyHeuristics(profile, paths);
}

/** Install the per-game winetricks verbs, once each. */
async function applyWineTricks(profile: GameProfile, paths: GamePaths, wine: WineRuntime): Promise<void> {
  const tricks = profile.wine.tricks;
  if (tricks.length === 0) {
    return;
  }
  const marker = join(paths.prefix, ".steam-mac-tricks");
  const done = (await readText(marker))?.trim().split("\n").filter(Boolean) ?? [];
  const todo = tricks.filter((trick) => !done.includes(trick));
  if (todo.length === 0) {
    log(`wine tricks: already installed (${tricks.join(", ")})`);
    return;
  }
  if (!which("winetricks")) {
    warn(`winetricks not found — install it to apply: ${todo.join(", ")}`);
    return;
  }
  for (const trick of todo) {
    log(`wine tricks: installing ${trick} (this downloads a redistributable)`);
    const result = await exec("winetricks", ["-q", trick], {
      env: { WINEPREFIX: paths.prefix, WINE: wine.distExe, WINESERVER: wine.distServer },
      allowFailure: true,
    });
    if (result.status !== 0) {
      warn(`winetricks ${trick} failed`);
      return;
    }
    done.push(trick);
    await writeText(marker, `${done.join("\n")}\n`);
  }
}

/** Import a finished depot and record the executable that actually landed. */
async function finalizeImport(
  profile: GameProfile,
  paths: GamePaths,
  wine: WineRuntime,
  manifest?: string,
): Promise<boolean> {
  const result = await importDepot(profile, paths, {
    manifest,
    env: { WINE: wine.distExe, WINE_RUNTIME: wine.name },
  });
  if (result.imported) {
    await ensureExecutable(profile, paths, wine);
    await applyHeuristics(profile, paths);
  }
  return result.imported;
}

/**
 * Infer per-game Wine settings from the imported executable: D3DX imports need
 * the native redistributable, and a 32-bit game asserts on GPTK's Wine 7.7.
 */
async function applyHeuristics(profile: GameProfile, paths: GamePaths): Promise<void> {
  const info = await readPe(join(paths.gameDir, profile.exe));
  if (!info) {
    return;
  }

  let changed = false;
  let runtimeChanged = false;

  const tricks = new Set(profile.wine.tricks);
  if (info.imports.some((dll) => /^d3dx9_\d+\.dll$/.test(dll))) tricks.add("d3dx9");
  if (info.imports.some((dll) => /^d3dx10_\d+\.dll$/.test(dll))) tricks.add("d3dx10");
  if (info.imports.some((dll) => /^d3dx11_\d+\.dll$/.test(dll))) tricks.add("d3dx11");

  // Community settings from Lutris, when the game is listed there.
  const lutris = await lutrisLookup(
    profile.store,
    profile.store === "gog" ? profile.gogId : profile.appid,
    profile.name,
  );
  if (lutris) {
    for (const trick of lutris.tricks) tricks.add(trick);
    for (const override of lutris.dllOverrides) {
      if (!profile.wine.dllOverrides.includes(override)) {
        profile.wine.dllOverrides.push(override);
        changed = true;
      }
    }
    if (lutris.tricks.length > 0 || lutris.dllOverrides.length > 0) {
      log(`lutris: winetricks [${lutris.tricks.join(", ")}] overrides [${lutris.dllOverrides.join(", ")}]`);
    }
  }

  if (tricks.size !== profile.wine.tricks.length) {
    log(`heuristics: D3DX imports → winetricks ${[...tricks].join(", ")}`);
    profile.wine.tricks = [...tricks];
    changed = true;
  }

  if (info.machine === "x86" && profile.wineRuntime === "gptk") {
    const versions = await installedWineVersions("devel");
    if (versions.length > 0) {
      warn(`heuristics: 32-bit executable — using wine-devel ${versions[0]} (GPTK's Wine 7.7 asserts on 32-bit games)`);
      profile.wineRuntime = "wine-devel";
      profile.wineVersion = versions[0]!;
      runtimeChanged = true;
      changed = true;
    } else {
      warn("heuristics: 32-bit executable — GPTK's Wine 7.7 may assert; install a Gcenx wine-devel build");
    }
  }

  if (!changed) {
    return;
  }
  await saveGame(profile);
  if (runtimeChanged) {
    log("heuristics: re-provisioning with the new runtime");
    await cmdSetup(profile.slug);
  }
}

/**
 * Make the profile point at an executable that exists.
 *
 * `add` gives a fresh game the placeholder `<slug>.exe`; the real name is only
 * known once the depot is in the prefix. When the configured file is missing,
 * detect the executable in the game folder, record it and rebuild the bundle.
 */
async function ensureExecutable(
  profile: GameProfile,
  paths: GamePaths,
  wine: WineRuntime,
): Promise<void> {
  if (exists(join(paths.gameDir, profile.exe))) {
    return;
  }
  const match = await detectExecutable(paths.gameDir, profile.name);
  if (!match) {
    warn(`no executable found in ${paths.gameDir} — set 'exe' in game.json`);
    return;
  }
  if (match.exe !== profile.exe) {
    warn(`configured executable '${profile.exe}' is missing — using '${match.exe}'`);
    profile.exe = match.exe;
    await saveGame(profile);
    await buildApp(profile, paths, wine);
  }
}

/**
 * Provision a freshly added game: setup, then download and import.
 *
 * The download needs a depot id and a SteamCMD login; when either is missing
 * the game stays registered and the message says how to continue. With
 * `refreshIcon` the icon is re-provisioned at the end, so the executable icon
 * can replace a placeholder once the files are in the prefix.
 */
export async function provisionGame(
  slug: string,
  options: { refreshIcon?: boolean } = {},
): Promise<void> {
  if (isDryRun()) {
    log(`dry-run: would provision ${slug}: setup → download → import`);
    return;
  }
  await cmdSetup(slug);

  const { profile } = await loadContext(slug);
  const missingId = profile.store === "gog" ? profile.gogId === 0 : profile.depot === 0;
  if (missingId) {
    warn(`no ${profile.store === "gog" ? "GOG product" : "depot"} id for ${slug} — set it with 'steam-mac edit ${slug}', then run 'steam-mac download ${slug}'`);
    return;
  }

  await cmdDownload(slug);
  await cmdImport(slug);
  if (options.refreshIcon) {
    await cmdIcon(slug);
  }
}

/**
 * Download the Windows depot.
 *
 * SteamCMD first (works for owned games and, anonymously, for free ones). When
 * it cannot help, no login, game not owned by the account, the command falls
 * back to the guided Steam-console flow and waits for the download to finish.
 */
export async function cmdDownload(slug: string, options: { manual?: boolean } = {}): Promise<void> {
  const { profile, paths, config, wine } = await loadContext(slug);
  if (profile.store === "gog") {
    if (profile.gogId === 0) {
      die("no GOG product id configured — set 'gogId' in game.json");
    }
    if (await isGameRunning(profile)) {
      die("the game is running — close it before downloading");
    }
    await downloadGog(profile, paths, wine);
    return;
  }
  if (profile.depot === 0) {
    die("no Steam depot id configured — set 'depot' in game.json");
  }
  if (await isGameRunning(profile)) {
    die("the game is running — close it before downloading");
  }

  await clearStaleDepotState(profile, paths);

  if (!options.manual) {
    try {
      log(`steamcmd: downloading depot ${profile.depot} of app ${profile.appid} (Windows build)`);
      const result = await downloadDepot({
        appid: profile.appid,
        depot: profile.depot,
        account: config.steamcmd,
      });
      if (result.depotDir) {
        log(`steamcmd: download complete → ${result.depotDir}`);
        await finalizeImport(profile, paths, wine, result.manifest);
        log(`done. play with: steam-mac run ${slug}`);
        return;
      }
    } catch (error) {
      if (isDryRun()) {
        throw error;
      }
      warn(`steamcmd could not download the depot: ${(error as Error).message}`);
      warn("falling back to the Steam console (run 'steam-mac login' for owned games)");
    }
  }

  await guidedConsoleDownload(profile, paths, config, wine);
}

async function guidedConsoleDownload(
  profile: GameProfile,
  paths: GamePaths,
  config: Config,
  wine: WineRuntime,
): Promise<void> {
  log("the Steam console opens in a moment");
  log(`type:  download_depot ${profile.appid} ${profile.depot}`);
  await exec("open", ["steam://open/console"], { allowFailure: true });

  if (isDryRun()) {
    log("dry-run: would wait for the depot download, then import");
    return;
  }

  const timeout = Number.parseInt(process.env.SM_UPDATE_TIMEOUT ?? "", 10) || 1800;
  log(`waiting for the depot download (up to ${timeout}s)...`);
  const finished = await waitForDepotDownload(profile, paths, timeout, (elapsed, bytes) => {
    if (elapsed > 0 && elapsed % 60 === 0) {
      log(`still waiting... ${elapsed}s (${humanSize(bytes)})`);
    }
  });
  if (!finished) {
    die(`timed out after ${timeout}s — rerun 'steam-mac download ${profile.slug}'`);
  }

  await finalizeImport(profile, paths, wine);
  log(`done. play with: steam-mac run ${profile.slug}`);
  void config;
}

/** Check for an update, and optionally download and import it. */
export async function cmdUpdate(slug: string, options: { check?: boolean } = {}): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  if (!(await gameInstalled(profile, paths))) {
    die("the game is not imported — run: steam-mac setup && steam-mac download");
  }

  const status = await updateStatus(profile, paths);
  if (options.check) {
    reportUpdateStatus(profile, status);
    if (status.state === "available" || status.state === "waiting") {
      process.exitCode = 3;
    }
    return;
  }

  if (status.state === "waiting") {
    await finalizeImport(profile, paths, wine, status.latest ?? undefined);
    return;
  }
  if (status.state === "up-to-date") {
    log(`already up to date (manifest ${status.installed})`);
    return;
  }

  reportUpdateStatus(profile, status);
  await cmdDownload(slug);
}

function reportUpdateStatus(profile: GameProfile, status: Awaited<ReturnType<typeof updateStatus>>): void {
  switch (status.state) {
    case "waiting":
      log(`update downloaded and waiting — run: steam-mac import ${profile.slug}`);
      break;
    case "available":
      log(`update available: installed ${status.installed ?? "unknown"}, latest ${status.latest}`);
      break;
    case "unknown":
      log("installed manifest unknown — run 'import' to adopt the current install");
      break;
    case "up-to-date":
      log(`up to date (manifest ${status.installed})`);
      break;
  }
}

// --- run ----------------------------------------------------------------------

/**
 * Launch the game through its `.app` bundle so macOS treats it as a normal app
 * (Dock icon, app registration). Falls back to the raw loader when the bundle
 * is missing. Streamed stdout is lost, but the bundle's `launch` script already
 * starts Windows Steam when needed.
 */
export async function cmdRun(slug: string): Promise<void> {
  const { profile, paths, config, wine: resolved } = await loadContext(slug);
  if (!(await gameInstalled(profile, paths))) {
    die("game not imported — run: steam-mac setup && steam-mac download");
  }
  if (await isGameRunning(profile)) {
    die("the game is already running");
  }

  let wine = resolved;
  if (wine.name === "gptk-apple" && !exists(wine.distExe)) {
    warn("Apple GPTK overlay not installed — falling back to the default GPTK (D3DMetal 3.0)");
    wine = resolveWine({ ...profile, wineRuntime: "gptk" }, config);
  }
  if (!exists(wine.distExe)) {
    die(`wine not found at ${wine.distExe} — run: steam-mac setup ${slug}`);
  }

  await recordRuntimeSnapshot(profile, wine);

  if (bundleRuntimeReady(paths.app)) {
    log(`launching ${profile.name} (app bundle) — stop with: steam-mac quit ${slug}`);
    await exec("open", [paths.app], { allowFailure: false });
    return;
  }

  const steamExe = windowsSteamExe(paths.prefix);
  if (exists(steamExe) && !(await isWineProcessRunning("steam\\.exe"))) {
    log("starting Windows Steam in the background (optional)");
    if (!isDryRun()) {
      const child = exec(wine.distExe, [WINDOWS_STEAM_ARG, "-cef-disable-gpu-compositing", "-silent"], {
        env: { WINEPREFIX: paths.prefix },
        allowFailure: true,
      });
      void child;
      await sleep(15_000);
    }
  }

  log(`launching ${profile.name}`);
  await exec(wine.distExe, [profile.exe], {
    cwd: paths.gameDir,
    env: { WINEPREFIX: paths.prefix },
    stdio: "inherit",
  });
}

/** Terminate every Wine process the game is using (a Cmd+Q substitute). */
export async function cmdQuit(slug: string): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  if (!(await isGameRunning(profile))) {
    log(`${profile.name} is not running`);
    return;
  }

  log(`stopping ${profile.name}`);
  await exec(wine.distServer, ["-k"], {
    env: { WINEPREFIX: paths.prefix },
    allowFailure: true,
  });
  log("stopped");
}

// --- window mode --------------------------------------------------------------

/** Switch the game to a native macOS window (Unity registry tweak). */
export async function cmdWindowed(slug: string): Promise<void> {
  await setWindowMode(slug, 1);
}

/** Switch the game back to borderless fullscreen. */
export async function cmdFullscreen(slug: string): Promise<void> {
  await setWindowMode(slug, 0);
}

async function setWindowMode(slug: string, want: 0 | 1): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  if (!profile.window.enabled) {
    die(`window mode switching is not configured for ${profile.name}`);
  }
  if (await isGameRunning(profile)) {
    die("the game is running — close it first");
  }

  const current = await gameScreenMode(profile, paths, wine);
  if (current === want) {
    log(`already in ${want === 1 ? "windowed" : "fullscreen"} mode`);
    return;
  }
  await setGameScreenMode(profile, paths, wine, want);
  log(`done — start the game with: steam-mac run ${slug}`);
}

async function gameScreenMode(
  profile: GameProfile,
  paths: GamePaths,
  wine: WineRuntime,
): Promise<number | null> {
  if (!profile.window.enabled) {
    return null;
  }
  const hex = (await regValue(wine, paths, profile.window.regKey, profile.window.settingsValue))?.toLowerCase();
  if (!hex) {
    return null;
  }
  const marker = Buffer.from(`"${profile.window.screenModeKey}":`).toString("hex");
  const at = hex.indexOf(marker);
  if (at < 0) {
    return null;
  }
  const digit = hex.slice(at + marker.length, at + marker.length + 2);
  if (digit === "30") {
    return 0;
  }
  if (digit === "31") {
    return 1;
  }

  return null;
}

async function setGameScreenMode(
  profile: GameProfile,
  paths: GamePaths,
  wine: WineRuntime,
  want: 0 | 1,
): Promise<void> {
  const hex = (await regValue(wine, paths, profile.window.regKey, profile.window.settingsValue))?.toLowerCase();
  if (!hex) {
    die("game settings not found — start the game once, close it, then retry");
  }
  const marker = Buffer.from(`"${profile.window.screenModeKey}":`).toString("hex");
  const at = hex.indexOf(marker);
  if (at < 0) {
    die(`could not find ${profile.window.screenModeKey} in the game settings`);
  }

  const before = hex.slice(0, at);
  const after = hex.slice(at + marker.length + 2);
  const digit = want === 0 ? "30" : "31";
  await exec(
    wine.distExe,
    [
      "reg",
      "add",
      profile.window.regKey,
      "/v",
      profile.window.settingsValue,
      "/t",
      "REG_BINARY",
      "/d",
      `${before}${marker}${digit}${after}`,
      "/f",
    ],
    { env: { WINEPREFIX: paths.prefix } },
  );
  if (profile.window.unityModeValue) {
    await exec(
      wine.distExe,
      [
        "reg",
        "add",
        profile.window.regKey,
        "/v",
        profile.window.unityModeValue,
        "/t",
        "REG_DWORD",
        "/d",
        want === 0 ? "0x1" : "0x3",
        "/f",
      ],
      { env: { WINEPREFIX: paths.prefix } },
    );
  }
}

async function regValue(
  wine: WineRuntime,
  paths: GamePaths,
  key: string,
  value: string,
): Promise<string | null> {
  const result = await exec(wine.distExe, ["reg", "query", key, "/v", value], {
    env: { WINEPREFIX: paths.prefix },
    allowFailure: true,
  });
  if (result.status !== 0) {
    return null;
  }
  let out = result.stdout.replace(/[ \r\n]/g, "");
  out = out.split("REG_BINARY").at(-1) ?? out;
  out = out.split("REG_DWORD").at(-1) ?? out;
  return out || null;
}

// --- runtime ------------------------------------------------------------------

/** The runtime in use plus the history, as shown by `runtime` and the TUI. */
export interface RuntimeReport {
  profile: GameProfile;
  fields: StatusField[];
  history: RuntimeSnapshot[];
}

/** Collect the runtime the game uses, the newest available version and the history. */
export async function collectRuntime(slug: string): Promise<RuntimeReport> {
  const { profile, wine } = await loadContext(slug);
  const details = await runtimeDetails(wine, profile);
  const flavor =
    wine.name === "wine-devel" || wine.name === "wine-staging" ? wine.name.slice("wine-".length) : "";
  const latest = flavor ? await latestWineVersion(flavor) : null;
  const fields: StatusField[] = [
    { label: "runtime", value: exists(wine.distExe) ? wine.name : `${wine.name} (not installed)` },
    { label: "description", value: details.summary },
    { label: "wine", value: details.wineVersion ?? "unknown" },
    { label: "direct3d", value: details.backend },
    { label: "pinned version", value: profile.wineVersion || "not pinned" },
    { label: "latest", value: latest ? (latest === profile.wineVersion ? `${latest} (current)` : latest) : "n/a" },
  ];

  return { profile, fields, history: profile.runtimeHistory };
}

/** Print the runtime in use and the recorded history. */
export async function cmdRuntime(slug: string): Promise<void> {
  const { profile, fields, history } = await collectRuntime(slug);
  process.stdout.write(`${profile.name} — runtime\n`);
  for (const field of fields) {
    process.stdout.write(`  ${field.label.padEnd(14)} ${field.value}\n`);
  }
  if (history.length > 0) {
    process.stdout.write("\n  history (oldest first)\n");
    for (const snapshot of history) {
      process.stdout.write(`    ${snapshot.at}  ${describeSnapshot(snapshot)}\n`);
    }
  }
}

/**
 * Try to move the game to the newest runtime this machine can offer.
 *
 * Gcenx `wine-devel` / `wine-staging` advance to the newest GitHub release.
 * `gptk-apple` re-overlays the D3DMetal from the mounted Apple DMG; `gptk`
 * switches to that overlay when the DMG is newer, and otherwise asks Homebrew
 * for a newer GPTK cask. The app bundle is rebuilt so it hosts the new loader,
 * and the previous runtime stays in the history for a rollback.
 */
export async function cmdRuntimeUpgrade(slug: string): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  const before = await runtimeDetails(wine, profile);
  log(`${profile.name} — runtime: ${before.summary}`);

  if (wine.name === "gptk" || wine.name === "gptk-apple") {
    const config = await loadConfig();
    const overlay = config.appleGptkSource
      ? await readD3dMetalVersion(join(config.appleGptkSource, "redist", "lib"))
      : null;

    if (wine.name === "gptk-apple") {
      if (!overlay) {
        warn("no Apple GPTK DMG configured (appleGptkSource) — nothing newer to overlay");
        return;
      }
      if (overlay === before.d3dMetal) {
        log(`already on the newest D3DMetal the DMG offers (${overlay})`);
        return;
      }
      log(`D3DMetal ${before.d3dMetal ?? "none"} → ${overlay} (overlay rebuild)`);
      await ensureWine(wine);
      await buildApp(profile, paths, wine);
      reportRollbackHint(profile);
      return;
    }

    if (overlay && overlay !== before.d3dMetal) {
      log(`the Apple DMG offers D3DMetal ${overlay} — switching to the gptk-apple runtime`);
      profile.wineRuntime = "gptk-apple";
      await saveGame(profile);
      const runtime = resolveWine(profile, config);
      await ensureWine(runtime);
      await buildApp(profile, paths, runtime);
      reportRollbackHint(profile);
      return;
    }

    if (!which("brew")) {
      die("homebrew is required: https://brew.sh");
    }
    log(`${wine.label}: brew upgrade --cask ${wine.cask}`);
    await exec("brew", ["upgrade", "--cask", wine.cask], { allowFailure: true });
    const after = await runtimeDetails(wine, profile);
    if (after.d3dMetal === before.d3dMetal) {
      log(`no newer GPTK from Homebrew (D3DMetal ${after.d3dMetal ?? "unknown"})`);
      return;
    }
    log(`D3DMetal ${before.d3dMetal ?? "?"} → ${after.d3dMetal}`);
    await buildApp(profile, paths, wine);
    reportRollbackHint(profile);
    return;
  }

  const flavor = wine.name.slice("wine-".length);
  const latest = await latestWineVersion(flavor);
  if (!latest) {
    warn("could not resolve the latest Gcenx build (is GitHub reachable?)");
    return;
  }
  if (latest === profile.wineVersion) {
    log(`already on the latest ${flavor} build (${latest})`);
    return;
  }
  log(`${flavor}: ${profile.wineVersion || "unset"} → ${latest}`);
  profile.wineVersion = latest;
  await saveGame(profile);
  const runtime = resolveWine(profile, await loadConfig());
  await ensureWine(runtime);
  await buildApp(profile, paths, runtime);
  reportRollbackHint(profile);
}

/**
 * Return to the last recorded runtime that is not the current one.
 *
 * The history is written every time a game is launched, so the entry to roll
 * back to is the most recent launch that used a different runtime.
 */
export async function cmdRuntimeRollback(slug: string): Promise<void> {
  const { profile, paths } = await loadContext(slug);
  const target = previousRuntime(profile);
  if (!target) {
    die("no previous runtime recorded — launch the game once with the current runtime");
  }

  log(`${profile.wineRuntime}${profile.wineVersion ? ` ${profile.wineVersion}` : ""} → ${describeSnapshot(target)}`);
  profile.wineRuntime = target.wineRuntime;
  profile.wineVersion = target.wineVersion;
  await saveGame(profile);
  const runtime = resolveWine(profile, await loadConfig());
  await ensureWine(runtime);
  await buildApp(profile, paths, runtime);
  log("rolled back — run the game to confirm");
}

/** Append the runtime a launch uses, deduplicating consecutive identical runs. */
async function recordRuntimeSnapshot(profile: GameProfile, wine: WineRuntime): Promise<void> {
  const details = await runtimeDetails(wine, profile);
  const snapshot: RuntimeSnapshot = {
    wineRuntime: profile.wineRuntime,
    wineVersion: profile.wineVersion,
    d3dMetal: details.d3dMetal ?? "",
    at: new Date().toISOString(),
  };
  const last = profile.runtimeHistory.at(-1);
  if (
    last &&
    last.wineRuntime === snapshot.wineRuntime &&
    last.wineVersion === snapshot.wineVersion &&
    last.d3dMetal === snapshot.d3dMetal
  ) {
    return;
  }
  profile.runtimeHistory = [...profile.runtimeHistory, snapshot].slice(-10);
  await saveGame(profile);
}

function runtimeKey(snapshot: { wineRuntime: string; wineVersion: string }): string {
  return `${snapshot.wineRuntime}:${snapshot.wineVersion}`;
}

/** The most recent history entry that differs from the current runtime. */
function previousRuntime(profile: GameProfile): RuntimeSnapshot | null {
  const current = runtimeKey(profile);
  return [...profile.runtimeHistory].reverse().find((snapshot) => runtimeKey(snapshot) !== current) ?? null;
}

function describeSnapshot(snapshot: RuntimeSnapshot): string {
  const detail = snapshot.d3dMetal ? `D3DMetal ${snapshot.d3dMetal}` : snapshot.wineVersion || "unpinned";
  return `${snapshot.wineRuntime} (${detail})`;
}

function reportRollbackHint(profile: GameProfile): void {
  const previous = previousRuntime(profile);
  if (previous) {
    log(`if it does not work, run: steam-mac runtime-rollback ${profile.slug} (→ ${describeSnapshot(previous)})`);
  }
}

// --- status / doctor ----------------------------------------------------------

/** One line of the `status` report. */
export interface StatusField {
  label: string;
  value: string;
}

/** Machine-readable install state, used by `status` and the TUI. */
export interface StatusReport {
  profile: GameProfile;
  fields: StatusField[];
}

/** Collect the install state of one game. */
export async function collectStatus(slug: string): Promise<StatusReport> {
  const { profile, paths, wine } = await loadContext(slug);
  const installed = await readInstalledManifestSafe(profile.slug);
  const status = await updateStatus(profile, paths);
  const details = await runtimeDetails(wine, profile);

  return {
    profile,
    fields: [
      { label: "appid / depot", value: `${profile.appid} / ${profile.depot}` },
      {
        label: "wine runtime",
        value: exists(wine.distExe) ? details.summary : `${wine.label} (missing — run: steam-mac setup ${slug})`,
      },
      { label: "prefix", value: exists(join(paths.prefix, "drive_c")) ? paths.prefix : `missing (${paths.prefix})` },
      { label: "game", value: (await gameInstalled(profile, paths)) ? humanSize(await dirBytes(paths.gameDir)) : "not imported" },
      { label: "exe", value: profile.exe },
      { label: "manifest", value: manifestLine(status.state, installed, status.latest) },
      { label: "window mode", value: await windowModeLine(profile, paths, wine) },
      { label: "app bundle", value: bundleLine(paths.app) },
      { label: "saves / mods", value: paths.dataDir || "not configured" },
    ],
  };
}

/** Print the install state of one game. */
export async function cmdStatus(slug: string): Promise<void> {
  const { profile, fields } = await collectStatus(slug);
  process.stdout.write(`${profile.name} — ${profile.slug} v${profile.version}\n`);
  for (const field of fields) {
    process.stdout.write(`  ${field.label.padEnd(14)} ${field.value}\n`);
  }
}

function manifestLine(state: string, installed: string | null, latest: string | null): string {
  if (state === "waiting") {
    return "download waiting (run: import)";
  }
  if (state === "available") {
    return `update available (installed ${installed ?? "none"}, latest ${latest})`;
  }
  if (state === "up-to-date") {
    return `up to date (${installed})`;
  }

  return "unknown (run: import to adopt the current install)";
}

async function windowModeLine(profile: GameProfile, paths: GamePaths, wine: WineRuntime): Promise<string> {
  if (!profile.window.enabled) {
    return "not configured for this game";
  }
  const mode = await gameScreenMode(profile, paths, wine);
  if (mode === 0) {
    return "fullscreen (borderless)";
  }
  if (mode === 1) {
    return "windowed (native macOS window)";
  }

  return "unknown (start the game once)";
}

function bundleLine(app: string): string {
  if (!exists(join(app, "Contents", "MacOS", "launch"))) {
    return `missing (${app})`;
  }

  return bundleRuntimeReady(app) ? `${app} (menu + Cmd+Q ready)` : `${app} (rebuild with: app)`;
}

/** One PASS/WARN/FAIL check. */
export interface DoctorCheck {
  level: "PASS" | "WARN" | "FAIL";
  label: string;
  detail?: string;
}

/** Doctor output, used by `doctor` and the TUI. */
export interface DoctorReport {
  profile: GameProfile;
  checks: DoctorCheck[];
  fails: number;
}

/** Run the read-only health checks for one game. */
export async function collectDoctor(slug: string): Promise<DoctorReport> {
  const { profile, paths, wine } = await loadContext(slug);
  const checks: DoctorCheck[] = [];
  const add = (level: DoctorCheck["level"], label: string, detail?: string) => {
    checks.push({ level, label, detail });
  };

  if (process.arch === "arm64") {
    add("PASS", "apple silicon");
  } else {
    add("FAIL", "apple silicon", `detected ${process.arch}`);
  }

  const major = Number.parseInt((await exec("sw_vers", ["-productVersion"])).stdout.split(".")[0] ?? "0", 10);
  if (major >= profile.minMacos) {
    add("PASS", "macOS version", String(major));
  } else {
    add("FAIL", "macOS version", `${major} is older than ${profile.minMacos}`);
  }

  if (exists(wine.distExe)) {
    add("PASS", wine.label, (await runtimeVersion(wine)) ?? "unknown");
  } else {
    add("FAIL", wine.label, `run: steam-mac setup ${slug}`);
  }

  if (exists(join(paths.prefix, "drive_c"))) {
    add("PASS", "wine prefix", paths.prefix);
  } else {
    add("FAIL", "wine prefix", `run: steam-mac setup ${slug}`);
  }

  if (await gameInstalled(profile, paths)) {
    add("PASS", "game files", await humanSize(await dirBytes(paths.gameDir)));
  } else {
    add("FAIL", "game files", `run: steam-mac download ${slug}`);
  }

  if (bundleRuntimeReady(paths.app)) {
    add("PASS", "app bundle", paths.app);
  } else if (exists(join(paths.app, "Contents", "MacOS", "launch"))) {
    add("WARN", "app bundle runtime", `rebuild with: steam-mac app ${slug}`);
  } else {
    add("WARN", "app bundle", `run: steam-mac app ${slug}`);
  }

  const freeGb = await freeDiskGb();
  if (freeGb >= 5) {
    add("PASS", "free disk space", `${freeGb} GB`);
  } else {
    add("WARN", "free disk space", `${freeGb} GB — updates need several GB`);
  }

  if (await isGameRunning(profile)) {
    add("WARN", "game process", "the game is running right now");
  }

  if (profile.hooks.doctorExtra) {
    checks.push(...(await runDoctorHook(profile, paths)));
  }

  return { profile, checks, fails: checks.filter((check) => check.level === "FAIL").length };
}

/** Print the health checks; `false` when any of them fails. */
export async function cmdDoctor(slug: string): Promise<boolean> {
  const { profile, checks, fails } = await collectDoctor(slug);
  log(`checking ${profile.name} (read-only)`);
  for (const check of checks) {
    process.stdout.write(`  ${check.level}  ${check.label}${check.detail ? ` — ${check.detail}` : ""}\n`);
  }
  process.stdout.write("\n");
  if (fails === 0) {
    log("no problems found");
    return true;
  }
  log(`${fails} problem(s) found — see docs/troubleshooting.md`);
  return false;
}

async function runDoctorHook(profile: GameProfile, paths: GamePaths): Promise<DoctorCheck[]> {
  const prelude = `sm_check() { printf '@@CHECK\\t%s\\t%s\\t%s\\n' "$1" "$2" "\${3:-}"; }`;
  const result = await exec("/bin/zsh", ["-c", `${prelude}\n${profile.hooks.doctorExtra}`], {
    cwd: paths.gameDir,
    env: { GAME_DIR: paths.gameDir, WINEPREFIX: paths.prefix },
    allowFailure: true,
  });
  const checks: DoctorCheck[] = [];
  for (const line of result.stdout.split("\n")) {
    if (!line.startsWith("@@CHECK\t")) {
      continue;
    }
    const [, rawLevel, label, detail] = line.split("\t");
    const level = rawLevel === "FAIL" || rawLevel === "WARN" ? rawLevel : "PASS";
    checks.push({ level, label: label ?? "hook check", detail: detail || undefined });
  }

  return checks;
}

// --- app / icon / logs / saves / mods -----------------------------------------

/** (Re)build the app bundle. */
export async function cmdApp(slug: string): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  await ensureQuitHotkey();
  await buildApp(profile, paths, wine);
}

/** Fetch (or refresh) the game's icon, then rebuild the bundle that hosts it. */
export async function cmdIcon(slug: string): Promise<void> {
  const { profile, paths, wine } = await loadContext(slug);
  const result = await provisionIcon(profile, gameAssetsDir(slug), {
    exePath: join(paths.gameDir, profile.exe),
  });
  if (!result.icns) {
    warn("no icon produced");
    return;
  }
  log(`icon written: ${result.icns}`);
  // The bundle copies the icon at build time, so refresh it now: otherwise the
  // app keeps the previous icon until the next `app` or `setup`.
  if (exists(join(paths.app, "Contents", "MacOS", "launch")) && exists(wine.distExe)) {
    await buildApp(profile, paths, wine);
  }
}

/** The loader log the app bundle writes (`~/.steam-mac/logs/<slug>.log`). */
function runtimeLogPath(slug: string): string {
  return join(logsDir(), `${slug}.log`);
}

/** The game log, or the loader log the bundle writes, whichever exists. */
function findLogPath(paths: GamePaths, slug: string): string | null {
  return [paths.playerLog, runtimeLogPath(slug)].find(
    (path): path is string => Boolean(path) && exists(path),
  ) ?? null;
}

/** Read the tail of the game log; empty when there is none. */
export async function readLogTail(slug: string, lines = 200): Promise<string[]> {
  const { paths } = await loadContext(slug);
  const log = findLogPath(paths, slug);
  if (!log) {
    return [];
  }
  const result = await exec("tail", ["-n", String(lines), log], { allowFailure: true });
  return result.stdout.replace(/\n$/, "").split("\n");
}

/** Print the tail of the game log. */
export async function cmdLogs(slug: string, lines = 80): Promise<void> {
  const { paths } = await loadContext(slug);
  const log = findLogPath(paths, slug);
  if (!log) {
    die(`no log yet — run the game once (looked for ${paths.playerLog || "<unset>"} and ${runtimeLogPath(slug)})`);
  }
  process.stdout.write(`${(await readLogTail(slug, lines)).join("\n")}\n`);
}

/** Open the saves folder. */
export async function cmdSaves(slug: string, options: { open?: boolean } = {}): Promise<string> {
  const { paths } = await loadContext(slug);
  if (!paths.dataDir) {
    die("no saves location configured for this game");
  }
  await mkdirp(paths.dataDir);
  if (options.open !== false && !isDryRun()) {
    await exec("open", [paths.dataDir], { allowFailure: true });
  }

  return paths.dataDir;
}

/** Open the mods folder. */
export async function cmdMods(slug: string, options: { open?: boolean } = {}): Promise<string> {
  const { paths } = await loadContext(slug);
  if (!paths.modsDir) {
    die("no mods location configured for this game");
  }
  await mkdirp(paths.modsDir);
  if (options.open !== false && !isDryRun()) {
    await exec("open", [paths.modsDir], { allowFailure: true });
  }

  return paths.modsDir;
}

/** Copy saves to a timestamped folder in `~/Documents`. */
export async function cmdBackupSaves(slug: string): Promise<void> {
  const { profile, paths } = await loadContext(slug);
  if (!paths.dataDir || !exists(paths.dataDir)) {
    die(`no saves found at ${paths.dataDir || "<unset>"}`);
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const dest = join(process.env.HOME ?? "", "Documents", `${profile.backupLabel}-saves-backup-${stamp}`);
  log(`copying saves to ${dest}`);
  await mkdirp(dest);
  if (profile.savePatterns.length > 0) {
    const includes = profile.savePatterns.flatMap((pattern) => ["--include", pattern]);
    await exec("rsync", ["-a", ...includes, "--exclude", "*", `${paths.dataDir}/`, `${dest}/`]);
  } else {
    await exec("rsync", ["-a", "--exclude", profile.modsSubdir, `${paths.dataDir}/`, `${dest}/`]);
  }
  log("done — restore by copying the files back");
}

// --- optional Windows Steam ---------------------------------------------------

/** Install the Windows Steam client inside the prefix. */
export async function cmdSteamSetup(slug: string, options: { force?: boolean } = {}): Promise<void> {
  const { paths, wine } = await loadContext(slug);
  const steamExe = windowsSteamExe(paths.prefix);
  if (exists(steamExe) && !options.force) {
    log("windows steam: already installed in the prefix");
    return;
  }
  const installer = join(paths.prefix, "drive_c", "SteamSetup.exe");
  log("downloading the Windows Steam installer");
  await mkdirp(join(paths.prefix, "drive_c"));
  await exec("curl", ["-fL", "-o", installer, "https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe"]);
  await exec(wine.distExe, ["C:\\SteamSetup.exe", "/S"], { env: { WINEPREFIX: paths.prefix } });
  log("installed — run 'steam-mac steam' once to log in");
}

/** Launch Windows Steam inside the prefix. */
export async function cmdSteam(slug: string): Promise<void> {
  const { paths, wine } = await loadContext(slug);
  if (!exists(windowsSteamExe(paths.prefix))) {
    die("windows steam is not installed — run: steam-mac steam-setup");
  }
  await exec(wine.distExe, [WINDOWS_STEAM_ARG, "-cef-disable-gpu-compositing"], {
    cwd: join(paths.prefix, "drive_c"),
    env: { WINEPREFIX: paths.prefix },
    stdio: "inherit",
  });
}

// --- uninstall ----------------------------------------------------------------

/** Remove the app bundle, and with `purge` the whole prefix. */
export async function cmdUninstall(
  slug: string,
  options: { purge?: boolean; yes?: boolean },
): Promise<void> {
  const { profile, paths } = await loadContext(slug);
  log(`this removes: ${paths.app}`);
  if (options.purge) {
    log(`and purges:   ${paths.prefix} (saves and mods included!)`);
  }

  if (!options.yes && !isDryRun() && !(await confirm("continue?"))) {
    log("aborted");
    return;
  }

  if (exists(paths.app)) {
    await remove(paths.app);
  } else {
    log("app bundle not found (nothing to do)");
  }

  if (options.purge) {
    if (exists(paths.prefix)) {
      await remove(paths.prefix);
    } else {
      log("wine prefix not found (nothing to do)");
    }
    await clearStaleDepotState(profile, paths);
  }
}

// --- shared helpers -----------------------------------------------------------

/** Is the game's process currently running under Wine? */
export async function isGameRunning(profile: GameProfile): Promise<boolean> {
  const pattern = profile.exe.replace(/\./g, "\\.");
  return isWineProcessRunning(pattern);
}

async function isWineProcessRunning(pattern: string): Promise<boolean> {
  const pids = await exec("pgrep", ["-f", pattern], { allowFailure: true });
  if (pids.status !== 0) {
    return false;
  }
  for (const pid of pids.stdout.split("\n").filter(Boolean)) {
    const comm = await exec("ps", ["-p", pid, "-o", "comm="], { allowFailure: true });
    if (comm.stdout.includes("wine")) {
      return true;
    }
  }

  return false;
}

async function readInstalledManifestSafe(slug: string): Promise<string | null> {
  const text = await readText(join(gameDir(slug), "manifest"));
  return text?.trim() || null;
}

async function dirBytes(dir: string): Promise<number> {
  if (!exists(dir)) {
    return 0;
  }
  const result = await exec("du", ["-sk", dir], { allowFailure: true });
  const kb = Number.parseInt(result.stdout.trim().split(/\s+/)[0] ?? "0", 10);
  return Number.isFinite(kb) ? kb * 1024 : 0;
}

/** Human-readable byte size. */
export function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

async function freeDiskGb(): Promise<number> {
  const result = await exec("df", ["-g", process.env.HOME ?? "/"], { allowFailure: true });
  const line = result.stdout.split("\n")[1] ?? "";
  return Number.parseInt(line.split(/\s+/)[3] ?? "0", 10) || 0;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
