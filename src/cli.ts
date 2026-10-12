// decanter — command line entry point.
//
// `decanter` with no command opens the OpenTUI interface when a terminal is
// attached, otherwise it prints help. Every game command takes a slug (a
// prefix or the exact name also works).
//
// docs: README.md, docs/architecture.md

import { createInterface } from "node:readline/promises";
import { addGame } from "./core/add.ts";
import { flagBool, flagNumber, flagString, parseArgs, type ParsedArgs } from "./core/args.ts";
import { loadConfig, updateConfig, type Config } from "./core/config.ts";
import { gameInstalled, updateStatus } from "./core/depot.ts";
import { exec, setDryRun } from "./core/exec.ts";
import { exists, remove } from "./core/fsx.ts";
import {
  cmdApp,
  cmdBackupSaves,
  cmdDoctor,
  cmdDownload,
  cmdFullscreen,
  cmdIcon,
  cmdImport,
  cmdLogs,
  cmdMods,
  cmdQuit,
  cmdRun,
  cmdRuntime,
  cmdRuntimeRollback,
  cmdRuntimeUpgrade,
  cmdSaves,
  cmdSetup,
  cmdStatus,
  cmdSteam,
  cmdSteamSetup,
  cmdUninstall,
  cmdUpdate,
  cmdWindowed,
  humanSize,
  loadContext,
} from "./core/lifecycle.ts";
import { CliError, die, log } from "./core/log.ts";
import { migrateRepo } from "./core/migrate.ts";
import { gameDir, gogAuthPath, epicAuthPath } from "./core/paths.ts";
import { gogExchangeCode, gogLoginUrl, extractGogCode, ensureGogToken, gogLibrary } from "./core/gog.ts";
import { epicExchangeCode, epicLoginUrl, extractEpicCode, ensureEpicToken, epicOwnedGames } from "./core/epic.ts";
import type { WineRuntime, Store } from "./core/profile.ts";
import { listGames, removeGameRecord, resolveGame } from "./core/registry.ts";
import { detectSteamAccount, detectSteamId, steamcmdLogin, steamcmdLogout, steamLibraryCacheAppIds } from "./core/steamcmd.ts";
import { steamOwnedGames } from "./core/store.ts";
import { readAppInfoNames } from "./core/appinfo.ts";
import { libraryFor, type LibraryGame } from "./core/library.ts";
import { VERSION } from "./core/version.ts";

/** Commands that take a game slug as their first positional. */
const SLUG_COMMANDS = new Set([
  "setup",
  "download",
  "import",
  "update",
  "run",
  "quit",
  "windowed",
  "fullscreen",
  "status",
  "doctor",
  "runtime",
  "runtime-upgrade",
  "runtime-rollback",
  "app",
  "icon",
  "logs",
  "saves",
  "mods",
  "backup-saves",
  "steam-setup",
  "steam",
  "uninstall",
  "remove",
  "rm",
  "edit",
]);

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (flagBool(args.flags, "dry-run")) {
    setDryRun(true);
  }
  if (args.command === "version" || flagBool(args.flags, "version")) {
    process.stdout.write(`decanter ${VERSION}\n`);
    return;
  }
  if (args.command === "help" || flagBool(args.flags, "help")) {
    printHelp();
    return;
  }

  if (args.command === "") {
    if (process.stdout.isTTY) {
      const { runTui } = await import("./tui/run.tsx");
      await runTui();
      return;
    }
    printHelp();
    return;
  }

  if (args.command === "list" || args.command === "ls") {
    await cmdList(args);
    return;
  }

  if (args.command === "add") {
    await cmdAdd(args);
    return;
  }

  if (args.command === "migrate") {
    let path = args.positionals[0];
    if (!path && process.stdin.isTTY) {
      path = await promptLine("legacy repo path: ");
    }
    if (!path) {
      die("usage: decanter migrate <repo-path> [--slug S] [--force]");
    }
    await migrateRepo(path, {
      slug: flagString(args.flags, "slug"),
      force: flagBool(args.flags, "force"),
    });
    return;
  }

  if (args.command === "login" || args.command === "logout") {
    await cmdAuth(args);
    return;
  }

  if (args.command === "config") {
    await cmdConfig(args);
    return;
  }

  if (SLUG_COMMANDS.has(args.command)) {
    await cmdGame(args);
    return;
  }

  die(`unknown command: ${args.command} (see: decanter help)`);
}

async function cmdGame(args: ParsedArgs): Promise<void> {
  const query = args.positionals[0];
  if (!query) {
    die(`usage: decanter ${args.command} <game> — see: decanter list`);
  }
  const profile = await resolveGame(query);
  const slug = profile.slug;

  switch (args.command) {
    case "setup":
      return cmdSetup(slug);
    case "download":
      return cmdDownload(slug, { manual: flagBool(args.flags, "manual") });
    case "import":
      return cmdImport(slug, { installer: flagString(args.flags, "installer") });
    case "update":
      return cmdUpdate(slug, { check: flagBool(args.flags, "check") });
    case "run":
      return cmdRun(slug);
    case "quit":
      return cmdQuit(slug);
    case "windowed":
      return cmdWindowed(slug);
    case "fullscreen":
      return cmdFullscreen(slug);
    case "status":
      return cmdStatus(slug);
    case "doctor": {
      const ok = await cmdDoctor(slug);
      if (!ok) {
        process.exitCode = 1;
      }
      return;
    }
    case "runtime":
      return cmdRuntime(slug);
    case "runtime-upgrade":
      return cmdRuntimeUpgrade(slug);
    case "runtime-rollback":
      return cmdRuntimeRollback(slug);
    case "app":
      return cmdApp(slug);
    case "icon":
      return cmdIcon(slug);
    case "logs":
      return cmdLogs(slug, flagNumber(args.flags, "n") ?? 80);
    case "saves": {
      const dir = await cmdSaves(slug, { open: !flagBool(args.flags, "no-open") });
      log(`saves folder: ${dir}`);
      return;
    }
    case "mods": {
      const dir = await cmdMods(slug, { open: !flagBool(args.flags, "no-open") });
      log(`mods folder: ${dir}`);
      return;
    }
    case "backup-saves":
      return cmdBackupSaves(slug);
    case "steam-setup":
      return cmdSteamSetup(slug, { force: flagBool(args.flags, "force") });
    case "steam":
      return cmdSteam(slug);
    case "uninstall":
      return cmdUninstall(slug, { purge: flagBool(args.flags, "purge"), yes: flagBool(args.flags, "yes") });
    case "remove":
    case "rm": {
      await cmdUninstall(slug, { purge: flagBool(args.flags, "purge"), yes: flagBool(args.flags, "yes") });
      await removeGameRecord(slug);
      log(`removed ${slug} from the registry`);
      return;
    }
    case "edit": {
      const editor = process.env.EDITOR ?? "open";
      const { gameProfilePath } = await import("./core/paths.ts");
      await exec(editor, [gameProfilePath(slug)], { stdio: "inherit", allowFailure: true });
      return;
    }
  }
}

async function cmdAdd(args: ParsedArgs): Promise<void> {
  const name = args.positionals[0];
  const appid = flagNumber(args.flags, "appid");
  if (!name && !appid) {
    die('usage: decanter add "<game name>" [--appid N] [--depot N]');
  }
  await addGame({
    name,
    appid,
    depot: flagNumber(args.flags, "depot"),
    slug: flagString(args.flags, "slug"),
    exe: flagString(args.flags, "exe"),
    runtime: flagString(args.flags, "runtime") as WineRuntime | undefined,
    store: flagString(args.flags, "store") as "steam" | "gog" | undefined,
    gogId: flagNumber(args.flags, "gog-id"),
    epicAppName: flagString(args.flags, "epic-app"),
    force: flagBool(args.flags, "force"),
  });
}

async function promptLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

/** `login <store> [arg]` / `logout <store>` for steam, gog or epic. */
async function cmdAuth(args: ParsedArgs): Promise<void> {
  const login = args.command === "login";
  const store = (args.positionals[0] ?? "steam").toLowerCase();
  const arg = args.positionals.slice(1).join(" ").trim();

  if (store === "steam") {
    if (!login) {
      await steamcmdLogout();
      log("steam: logged out");
      return;
    }
    const config = await loadConfig();
    const username =
      arg || config.steamcmd.username || (await detectSteamAccount(config.steamRoot)) || "";
    if (!username) {
      die("give a Steam username: decanter login steam <username>");
    }
    await updateConfig({ steamcmd: { anonymous: false, username } });
    await steamcmdLogin({ anonymous: false, username });
    return;
  }

  if (store === "gog") {
    if (!login) {
      await remove(gogAuthPath());
      log("gog: logged out");
      return;
    }
    if (arg) {
      await gogExchangeCode(extractGogCode(arg));
      log("gog: login stored");
      return;
    }
    const url = gogLoginUrl();
    log("log in to GOG in the browser, then paste the redirect URL (or just the code):");
    log(`  ${url}`);
    await exec("open", [url], { allowFailure: true });
    if (!process.stdin.isTTY) {
      log("then run: decanter login gog <redirect-url-or-code>");
      return;
    }
    const answer = await promptLine("redirect URL or code: ");
    if (!answer) {
      die("no code given");
    }
    await gogExchangeCode(extractGogCode(answer));
    log("gog: login stored");
    return;
  }

  if (store === "epic") {
    if (!login) {
      await remove(epicAuthPath());
      log("epic: logged out");
      return;
    }
    if (arg) {
      await epicExchangeCode(extractEpicCode(arg));
      log("epic: login stored");
      return;
    }
    const url = epicLoginUrl();
    log("log in to Epic in the browser, then paste the authorization code it prints:");
    log(`  ${url}`);
    await exec("open", [url], { allowFailure: true });
    if (!process.stdin.isTTY) {
      log("then run: decanter login epic <code>");
      return;
    }
    const answer = await promptLine("authorization code: ");
    if (!answer) {
      die("no code given");
    }
    await epicExchangeCode(extractEpicCode(answer));
    log("epic: login stored");
    return;
  }

  die(`unknown store '${store}' — expected 'steam', 'gog' or 'epic'`);
}

async function cmdConfig(args: ParsedArgs): Promise<void> {  if (args.positionals.length === 0) {
    process.stdout.write(`${JSON.stringify(await loadConfig(), null, 2)}\n`);
    return;
  }
  const patch: Record<string, unknown> = {};
  for (const pair of args.positionals) {
    const [key, value] = pair.split("=", 2) as [string, string | undefined];
    if (!key || value === undefined) {
      die("usage: decanter config key=value ...");
    }
    if (key.startsWith("steamcmd.")) {
      const nested = (patch.steamcmd ?? {}) as Record<string, unknown>;
      nested[key.slice("steamcmd.".length)] = value === "true" ? true : value === "false" ? false : value;
      patch.steamcmd = nested;
    } else {
      patch[key] = value;
    }
  }
  const next = await updateConfig(patch as never);
  process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
}

/** `list` shows the local registry; `list <store>` the games the store owns. */
async function cmdList(args: ParsedArgs): Promise<void> {
  const store = (args.positionals[0] ?? "").toLowerCase();
  if (!store) {
    await printList();
    return;
  }
  if (store !== "steam" && store !== "gog" && store !== "epic") {
    die(`unknown store '${store}' — expected 'steam', 'gog' or 'epic'`);
  }
  const refresh = flagBool(args.flags, "refresh");
  const config = await loadConfig();

  // Steam without a key: the client's own caches, fully offline.
  if (store === "steam" && !config.steamApiKey) {
    const appids = await steamLibraryCacheAppIds(config.steamRoot);
    if (appids.length === 0) {
      die("no Steam library cache to read — open Steam once, or run 'decanter config steamApiKey=<key>'");
    }
    const names = await readAppInfoNames(config.steamRoot);
    const games: LibraryGame[] = appids
      .map((appid) => ({ id: String(appid), title: names.get(appid) ?? String(appid), detail: "" }))
      .sort((a, b) => a.title.localeCompare(b.title));
    printGames(games);
    log(`${games.length} Steam game(s) from the local cache`);
    return;
  }

  // Everything else: the local cache first, the store API on a miss/refresh.
  const result = await libraryFor(store as Store, refresh, () => fetchStoreLibrary(store as Store, config));
  printGames(result.games);
  log(
    `${result.games.length} ${store} game(s) ${result.fromCache ? "from cache" : "fetched"} — 'list ${store} --refresh' to update`,
  );
}

/** Fetch a store's owned games from its API (normalised). */
async function fetchStoreLibrary(store: Store, config: Config): Promise<LibraryGame[]> {
  if (store === "gog") {
    return (await gogLibrary(await ensureGogToken())).map((game) => ({
      id: String(game.id),
      title: game.title,
      detail: "",
    }));
  }
  if (store === "epic") {
    return (await epicOwnedGames(await ensureEpicToken())).map((game) => ({
      id: game.appName,
      title: game.title,
      detail: game.namespace,
    }));
  }
  const steamid = config.steamId || (await detectSteamId(config.steamRoot));
  if (!steamid) {
    die("could not find a SteamID — open Steam once, or run 'decanter config steamId=<steamid64>'");
  }
  return (await steamOwnedGames(config.steamApiKey, steamid)).map((game) => ({
    id: String(game.appid),
    title: game.name,
    detail: "",
  }));
}

function printGames(games: LibraryGame[]): void {
  for (const game of games) {
    process.stdout.write(`${game.id.padEnd(16)} ${game.title}${game.detail ? `  [${game.detail}]` : ""}\n`);
  }
}

async function printList(): Promise<void> {
  const games = await listGames();
  if (games.length === 0) {
    log('no games yet — add one with: decanter add "<game name>"');
    return;
  }
  const rows: Array<[string, string, string, string, string]> = [];
  for (const game of games) {
    const ctx = await loadContext(game.slug);
    const imported = await gameInstalled(ctx.profile, ctx.paths);
    const status = await updateStatus(ctx.profile, ctx.paths);
    rows.push([
      game.slug,
      `${game.appid}/${game.depot || "?"}`,
      imported ? humanSize(await sizeOf(gameDir(game.slug))) : "—",
      statusLabel(status.state),
      exists(ctx.paths.app) ? "yes" : "no",
    ]);
  }
  const widths = [0, 1, 2, 3, 4].map((i) => Math.max(header()[i]!.length, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ");
  process.stdout.write(`${line([...header()])}\n`);
  for (const row of rows) {
    process.stdout.write(`${line([...row])}\n`);
  }
}

function header(): readonly string[] {
  return ["SLUG", "APP/DEPOT", "SIZE", "UPDATE", "APP"];
}

function statusLabel(state: string): string {
  if (state === "available") {
    return "available";
  }
  if (state === "waiting") {
    return "waiting";
  }
  if (state === "up-to-date") {
    return "current";
  }

  return "unknown";
}

async function sizeOf(dir: string): Promise<number> {
  if (!exists(dir)) {
    return 0;
  }
  const result = await exec("du", ["-sk", dir], { allowFailure: true });
  const kb = Number.parseInt(result.stdout.trim().split(/\s+/)[0] ?? "0", 10);
  return Number.isFinite(kb) ? kb * 1024 : 0;
}

function printHelp(): void {
  process.stdout.write(`decanter ${VERSION} — wrap any Windows-only PC game (Steam, GOG, Epic) into a macOS .app

usage: decanter [command] [game] [options]      (no command opens the TUI)

registry:
  list, ls [store]      list registered games, or a store's games (steam, gog, epic)
  add "<name>"          add a game from a store (--store steam|gog|epic, --appid N, --gog-id N, --epic-app N)
  remove <game>         uninstall and forget a game (--purge --yes)
  migrate <path>        import a legacy per-game repo (--slug S --force)
  config [k=v ...]      show or change machine-wide settings

accounts:
  login <store> [arg]   log in to steam, gog or epic (gog/epic: paste the code)
  logout <store>        log out of steam, gog or epic

lifecycle:
  setup <game>          Rosetta, Wine runtime, prefix, icon, app bundle
  download <game>       fetch the Windows depot (SteamCMD, or --manual console)
  import <game>         move a finished depot download into the prefix
  update <game>         check for and install an update (--check exits 3 if any)
  run <game>            launch the game
  quit <game>           stop the game's Wine processes (Cmd+Q substitute)
  windowed <game>       switch to a native macOS window
  fullscreen <game>     switch back to borderless fullscreen
  app <game>            (re)build the .app bundle
  icon <game>           fetch (or refresh) the game icon
  status <game>         show the install state
  runtime <game>        show the Wine/Direct3D runtime in use and its history
  runtime-upgrade <game>  try the newest Wine build / D3DMetal overlay
  runtime-rollback <game> return to the previous recorded runtime
  doctor <game>         PASS/WARN/FAIL checks (exit 1 on failure)
  logs <game>           tail the game log (-n N)
  saves <game>          open the saves folder
  mods <game>           open the mods folder
  backup-saves <game>   copy saves to ~/.decanter/backups
  steam-setup <game>    install Windows Steam inside the prefix
  steam <game>          launch Windows Steam inside the prefix
  uninstall <game>      remove the app bundle (--purge deletes the prefix)

interface:
  (no command)          open the OpenTUI interface
  version               print the version
  help                  this message

options:
  --dry-run             print what would happen without changing anything
  --yes, -y             skip confirmation prompts
  --check               update: report only; exit 3 when an update is available
  --refresh             list <store>: fetch from the store instead of the local cache
  --manual              download: skip SteamCMD, use the Steam console
  --purge               remove/uninstall: also delete the Wine prefix
  --installer <path>    import: run a GOG offline installer in the prefix
  --force               add/migrate/steam-setup: overwrite

docs: README.md, docs/architecture.md, docs/managing.md
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof CliError) {
    process.stderr.write(`decanter: ${error.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`decanter: unexpected error: ${(error as Error)?.stack ?? String(error)}\n`);
  process.exit(1);
});
