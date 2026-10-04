// Wine runtime resolution and provisioning.
//
// Two backends:
//   gptk          Apple's Game Porting Toolkit (Gcenx cask). Carries D3DMetal
//                 for Direct3D, but bundles Wine 7.7.
//   wine-devel    A current Gcenx Wine build, fetched as a tarball into
//   wine-staging  ~/.steam-mac/wine. Needed by 32-bit OpenGL games that crash
//                 on GPTK's Wine 7.7; no Homebrew cask (they conflict with GPTK).
//
// docs: docs/adr/ (see the runtime ADR), docs/managing.md

import { dirname, join } from "node:path";
import type { Config } from "./config.ts";
import { exec, isDryRun, which } from "./exec.ts";
import { exists, mkdirp, remove } from "./fsx.ts";
import { die, log, warn } from "./log.ts";
import { appleGptkAppDir, wineBuildDir } from "./paths.ts";
import type { GameProfile, WineRuntime as WineRuntimeName } from "./profile.ts";

/** A resolved Wine runtime on disk. */
export interface WineRuntime {
  name: WineRuntimeName;
  label: string;
  app: string;
  distDir: string;
  distExe: string;
  distServer: string;
  preloader: string | null;
  cask: string;
  version: string;
  /** Apple-DMG directory the `gptk-apple` overlay is built from. */
  appleSource?: string;
  /** Gcenx app the `gptk-apple` overlay is cloned from. */
  baseApp?: string;
}

function envOverride(profile: GameProfile, suffix: string): string | undefined {
  return process.env[`${profile.envPrefix}_${suffix}`];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Resolve which Wine runtime the game uses and where it lives. */
export function resolveWine(profile: GameProfile, config: Config): WineRuntime {
  const name =
    (envOverride(profile, "WINE_RUNTIME") as WineRuntimeName | undefined) ??
    profile.wineRuntime;
  const version = envOverride(profile, "WINE_VERSION") ?? profile.wineVersion;

  if (name === "gptk") {
    const app =
      envOverride(profile, "WINE_APP") ??
      envOverride(profile, "GPTK_APP") ??
      config.gptkApp;
    return build({ name, label: "Game Porting Toolkit", app, cask: config.gptkCask, version });
  }

  if (name === "gptk-apple") {
    const app = envOverride(profile, "WINE_APP") ?? appleGptkAppDir();
    const baseApp = envOverride(profile, "GPTK_APP") ?? config.gptkApp;
    const appleSource =
      envOverride(profile, "GPTK_APPLE_SOURCE") ?? config.appleGptkSource;
    return build({
      name,
      label: "Game Porting Toolkit (Apple)",
      app,
      cask: config.gptkCask,
      version,
      requireWine64: true,
      appleSource,
      baseApp,
    });
  }

  if (name === "wine-devel" || name === "wine-staging") {
    if (!version) {
      die(`GAME_WINE_VERSION is required for the '${name}' runtime`);
    }
    const flavor = name.slice("wine-".length);
    const app =
      envOverride(profile, "WINE_APP") ??
      join(wineBuildDir(flavor, version), `Wine ${capitalize(flavor)}.app`);
    return build({ name, label: `Wine ${flavor} ${version}`, app, cask: "", version });
  }

  die(`unknown wine runtime '${name}' (expected gptk, gptk-apple, wine-devel or wine-staging)`);
}

function build(input: {
  name: WineRuntimeName;
  label: string;
  app: string;
  cask: string;
  version: string;
  /** Trust the Gcenx layout and use `wine64` even before the tree exists. */
  requireWine64?: boolean;
  appleSource?: string;
  baseApp?: string;
}): WineRuntime {
  const distDir = join(input.app, "Contents", "Resources", "wine");
  const wine64 = join(distDir, "bin", "wine64");
  const wine = join(distDir, "bin", "wine");
  const preloader = join(distDir, "bin", "wine64-preloader");
  return {
    name: input.name,
    label: input.label,
    app: input.app,
    distDir,
    distExe: input.requireWine64 || exists(wine64) ? wine64 : wine,
    distServer: join(distDir, "bin", "wineserver"),
    preloader: input.requireWine64 || exists(preloader) ? preloader : null,
    cask: input.cask,
    version: input.version,
    appleSource: input.appleSource,
    baseApp: input.baseApp,
  };
}

/** Print the runtime's reported Wine version, or `null`. */
export async function wineVersion(runtime: WineRuntime): Promise<string | null> {
  if (!exists(runtime.distExe)) {
    return null;
  }
  const result = await exec(runtime.distExe, ["--version"], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * The D3DMetal framework version carried by the runtime, or `null`.
 *
 * GPTK's Wine reports a stale `(Game Porting Toolkit 1.1)` tag, so the
 * framework version is the honest way to say which GPTK a runtime uses.
 */
export async function d3dMetalVersion(runtime: WineRuntime): Promise<string | null> {
  return readD3dMetalVersion(join(runtime.distDir, "lib"));
}

/** Read the D3DMetal version from any directory holding an `external` folder. */
async function readD3dMetalVersion(libDir: string): Promise<string | null> {
  const plist = join(
    libDir,
    "external",
    "D3DMetal.framework",
    "Versions",
    "Current",
    "Resources",
    "Info.plist",
  );
  if (!exists(plist)) {
    return null;
  }
  const result = await exec("plutil", ["-extract", "CFBundleShortVersionString", "raw", plist], {
    allowFailure: true,
  });
  const version = result.stdout.trim();
  return result.status === 0 && version ? version : null;
}

/** `wine-7.7 (Game Porting Toolkit 1.1)` → `wine-7.7`. */
function baseWineVersion(version: string | null): string | null {
  return version?.match(/^wine-[\d.]+/)?.[0] ?? version;
}

/** A one-line runtime description: `D3DMetal 3.0 · wine-7.7`, or `null`. */
export async function runtimeVersion(runtime: WineRuntime): Promise<string | null> {
  if (!exists(runtime.distExe)) {
    return null;
  }
  const wine = baseWineVersion(await wineVersion(runtime));
  const d3d = await d3dMetalVersion(runtime);
  if (d3d && wine) {
    return `D3DMetal ${d3d} · ${wine}`;
  }

  return d3d ? `D3DMetal ${d3d}` : wine;
}

/** Install the runtime when it is missing. Idempotent. */
export async function ensureWine(runtime: WineRuntime): Promise<void> {
  if (runtime.name === "gptk-apple") {
    await ensureAppleGptk(runtime);
    return;
  }

  if (exists(runtime.distExe)) {
    log(`${runtime.label}: already installed (${(await runtimeVersion(runtime)) ?? "unknown"})`);
    return;
  }

  if (runtime.name === "gptk") {
    if (!which("brew")) {
      die("homebrew is required: https://brew.sh");
    }
    log(`${runtime.label}: installing ${runtime.cask}`);
    await exec("brew", ["trust", "gcenx/wine"], { allowFailure: true });
    await exec("brew", ["install", "--cask", runtime.cask]);
    return;
  }

  const flavor = runtime.name.slice("wine-".length);
  const url = `https://github.com/Gcenx/macOS_Wine_builds/releases/download/${runtime.version}/wine-${flavor}-${runtime.version}-osx64.tar.xz`;
  const dest = wineBuildDir(flavor, runtime.version);
  const archive = `${dest}.tar.xz`;

  log(`${runtime.label}: downloading ${runtime.version}`);
  await mkdirp(dest);
  await exec("curl", ["-fL", "--retry", "3", "-o", archive, url]);
  if (isDryRun()) {
    return;
  }
  await exec("tar", ["xJf", archive, "-C", dest]);
  await remove(archive);
}

/**
 * Build the opt-in GPTK overlay: clone a Gcenx loader and merge Apple's DMG
 * `redist/lib` (D3DMetal plus the D3D bridge `.so`/`.dll`) into its `lib`.
 *
 * Apple's Read Me replaces `lib/external` and `lib/wine` wholesale; that drops
 * the full Wine tree the Gcenx app carries, so this merges the redist subset.
 */
async function ensureAppleGptk(runtime: WineRuntime): Promise<void> {
  const current = exists(runtime.distExe) ? await d3dMetalVersion(runtime) : null;
  const source = runtime.appleSource;
  const redist = source ? join(source, "redist", "lib") : "";
  if (!source || !exists(redist)) {
    if (current) {
      log(`${runtime.label}: already installed (D3DMetal ${current}) — set appleGptkSource to rebuild`);
      return;
    }
    die(
      "set the Apple GPTK directory first: steam-mac config appleGptkSource='/Volumes/Evaluation environment for Windows games 4.0 beta 2'",
    );
  }

  const wanted = await readD3dMetalVersion(redist);
  if (current && wanted && current === wanted) {
    log(`${runtime.label}: already installed (D3DMetal ${current})`);
    return;
  }

  const baseApp = runtime.baseApp;
  if (!baseApp) {
    die(`no base Wine loader configured for the '${runtime.name}' runtime`);
  }
  if (!exists(join(baseApp, "Contents", "Resources", "wine", "bin", "wine64"))) {
    log(`${runtime.label}: installing the base loader`);
    await ensureWine(
      build({
        name: "gptk",
        label: "Game Porting Toolkit",
        app: baseApp,
        cask: runtime.cask,
        version: runtime.version,
      }),
    );
  }

  log(`${runtime.label}: building the D3DMetal${wanted ? ` ${wanted}` : ""} overlay in ${runtime.app}`);
  await remove(runtime.app);
  await mkdirp(dirname(runtime.app));
  const cloned = await exec("cp", ["-Rc", baseApp, runtime.app], { allowFailure: true });
  if (cloned.status !== 0) {
    await exec("ditto", [baseApp, runtime.app]);
  }
  const lib = join(runtime.distDir, "lib");
  await exec("ditto", [join(redist, "external"), join(lib, "external")]);
  await exec("ditto", [join(redist, "wine"), join(lib, "wine")]);
}

/** Create or update the Wine prefix. */
export async function wineboot(runtime: WineRuntime, prefix: string): Promise<void> {
  const initialized = exists(join(prefix, "drive_c"));
  if (initialized) {
    log(`wine prefix: updating ${prefix}`);
    await exec(runtime.distExe, ["wineboot", "-u"], { env: { WINEPREFIX: prefix } });
    return;
  }
  log(`wine prefix: creating ${prefix}`);
  await mkdirp(prefix);
  await exec(runtime.distExe, ["wineboot", "-i"], { env: { WINEPREFIX: prefix } });
}

/** Clear Gatekeeper's quarantine flag from the runtime. */
export async function clearQuarantine(runtime: WineRuntime): Promise<void> {
  if (!exists(runtime.app)) {
    warn(`${runtime.label}: app not found at ${runtime.app}`);
    return;
  }
  await exec("xattr", ["-dr", "com.apple.quarantine", runtime.app], { allowFailure: true });
}

/** The Wine directories shared by every prefix. */
export function winePaths(runtime: WineRuntime): { lib: string; share: string } {
  return { lib: join(runtime.distDir, "lib"), share: join(runtime.distDir, "share") };
}
