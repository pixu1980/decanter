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

import { join } from "node:path";
import type { Config } from "./config.ts";
import { exec, isDryRun, which } from "./exec.ts";
import { exists, mkdirp, remove } from "./fsx.ts";
import { die, log, warn } from "./log.ts";
import { wineBuildDir } from "./paths.ts";
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

  die(`unknown wine runtime '${name}' (expected gptk, wine-devel or wine-staging)`);
}

function build(input: {
  name: WineRuntimeName;
  label: string;
  app: string;
  cask: string;
  version: string;
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
    distExe: exists(wine64) ? wine64 : wine,
    distServer: join(distDir, "bin", "wineserver"),
    preloader: exists(preloader) ? preloader : null,
    cask: input.cask,
    version: input.version,
  };
}

/** Print the runtime's reported version, or `null`. */
export async function wineVersion(runtime: WineRuntime): Promise<string | null> {
  if (!exists(runtime.distExe)) {
    return null;
  }
  const result = await exec(runtime.distExe, ["--version"], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Install the runtime when it is missing. Idempotent. */
export async function ensureWine(runtime: WineRuntime): Promise<void> {
  if (exists(runtime.distExe)) {
    log(`${runtime.label}: already installed (${(await wineVersion(runtime)) ?? "unknown"})`);
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
