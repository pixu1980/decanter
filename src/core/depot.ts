// Depot discovery, import and update tracking.
//
// A Steam depot download lands in a `steamapps/content/app_<appid>/depot_<depot>`
// folder, whether it was made by the native Steam console, by SteamCMD, or by
// the guided fallback. `import` moves that folder into the Wine prefix and
// records which manifest was installed so `update` can tell if it is stale.
//
// docs: docs/managing.md

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { exec, runShell } from "./exec.ts";
import { exists, mkdirp, readText, remove, writeText } from "./fsx.ts";
import type { GamePaths } from "./game.ts";
import { die, log, warn } from "./log.ts";
import { gameManifestPath, steamcmdDir } from "./paths.ts";
import type { GameProfile } from "./profile.ts";

/** Folders a depot download can appear in, native Steam and SteamCMD alike. */
export function depotContentDirs(paths: GamePaths, profile: GameProfile): string[] {
  const relative = join("steamapps", "content", `app_${profile.appid}`, `depot_${profile.depot}`);
  return [
    join(paths.steamRoot, relative),
    join(paths.steamRoot, "Steam.AppBundle", "Steam", "Contents", "MacOS", relative),
    join(steamcmdDir(), relative),
  ];
}

/** Folders holding `<depot>_<manifest>.manifest` files. */
export function depotCacheDirs(paths: GamePaths): string[] {
  return [
    join(paths.steamRoot, "depotcache"),
    join(paths.steamRoot, "Steam.AppBundle", "Steam", "Contents", "MacOS", "depotcache"),
    join(steamcmdDir(), "steamapps", "depotcache"),
  ];
}

/** Is this folder non-empty? */
export async function depotHasContent(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length > 0;
  } catch {
    return false;
  }
}

/** The first depot folder that exists and has files. */
export async function findDepotDir(dirs: string[]): Promise<string | null> {
  for (const dir of dirs) {
    if (await depotHasContent(dir)) {
      return dir;
    }
  }

  return null;
}

/** Newest manifest id for a depot, read from the `depotcache` folders. */
export async function latestManifest(dirs: string[], depot: number): Promise<string | null> {
  let best: { id: string; mtime: number } | null = null;
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match = new RegExp(`^${depot}_(\\d+)\\.manifest$`).exec(entry);
      if (!match) {
        continue;
      }
      const { mtimeMs } = await stat(join(dir, entry));
      if (!best || mtimeMs > best.mtime) {
        best = { id: match[1]!, mtime: mtimeMs };
      }
    }
  }

  return best?.id ?? null;
}

/** Manifest id recorded when the game was imported. */
export async function readInstalledManifest(slug: string): Promise<string | null> {
  const text = await readText(gameManifestPath(slug));
  const id = text?.replace(/\s+/g, "") ?? "";
  return id || null;
}

/** Persist the installed manifest id. */
export async function recordManifest(slug: string, id: string): Promise<void> {
  await writeText(gameManifestPath(slug), `${id}\n`);
}

/** Is the game's main executable in the prefix? */
export async function gameInstalled(profile: GameProfile, paths: GamePaths): Promise<boolean> {
  if (!exists(paths.gameDir)) {
    return false;
  }
  if (profile.exe) {
    return exists(join(paths.gameDir, profile.exe));
  }

  return depotHasContent(paths.gameDir);
}

export interface ImportResult {
  imported: boolean;
  manifest: string | null;
  depotDir: string | null;
}

/**
 * Move a finished depot download into the prefix and record its manifest.
 *
 * The depot folder is emptied (rsync `--remove-source-files` then removed), so
 * the next download fetches the current build again.
 */
export async function importDepot(
  profile: GameProfile,
  paths: GamePaths,
  options: { manifest?: string; env?: Record<string, string | undefined> } = {},
): Promise<ImportResult> {
  const dirs = depotContentDirs(paths, profile);
  const depotDir = await findDepotDir(dirs);
  const manifest =
    options.manifest ?? (await latestManifest(depotCacheDirs(paths), profile.depot));

  if (!depotDir) {
    if (await gameInstalled(profile, paths)) {
      log("nothing to import — the game is already installed");
      return { imported: false, manifest, depotDir: null };
    }
    die(`nothing to import: no depot download in ${dirs[0]} and no game in ${paths.gameDir}`);
  }

  log(`importing depot: ${depotDir} → ${paths.gameDir}`);
  await mkdirp(paths.gameDir);
  await exec("rsync", ["-a", "--remove-source-files", `${depotDir}/`, `${paths.gameDir}/`]);
  await remove(depotDir);

  await writeText(join(paths.gameDir, "steam_appid.txt"), `${profile.appid}\n`);
  if (manifest) {
    await recordManifest(profile.slug, manifest);
    log(`recorded depot manifest: ${manifest}`);
  }

  await runPostImportHook(profile, paths, options.env);

  return { imported: true, manifest, depotDir };
}

/** Run the game's `postImport` shell snippet, when it has one. */
export async function runPostImportHook(
  profile: GameProfile,
  paths: GamePaths,
  env: Record<string, string | undefined> = {},
): Promise<void> {
  const script = profile.hooks.postImport;
  if (!script) {
    return;
  }
  log("running the game post-import hook");
  const result = await runShell(script, {
    cwd: paths.gameDir,
    env: {
      GAME_DIR: paths.gameDir,
      GAME_EXE: profile.exe,
      WINEPREFIX: paths.prefix,
      ...env,
    },
  });
  if (result.status !== 0) {
    warn("the post-import hook reported an error — see the output above");
  }
}

export type UpdateState = "waiting" | "unknown" | "available" | "up-to-date";

export interface UpdateStatus {
  state: UpdateState;
  installed: string | null;
  latest: string | null;
  depotDir: string | null;
}

/** Compare the installed manifest with the newest one Steam has cached. */
export async function updateStatus(
  profile: GameProfile,
  paths: GamePaths,
): Promise<UpdateStatus> {
  const depotDir = await findDepotDir(depotContentDirs(paths, profile));
  const installed = await readInstalledManifest(profile.slug);
  const latest = await latestManifest(depotCacheDirs(paths), profile.depot);

  if (depotDir) {
    return { state: "waiting", installed, latest, depotDir };
  }
  if (!installed && latest) {
    return { state: "unknown", installed, latest, depotDir };
  }
  if (latest && latest !== installed) {
    return { state: "available", installed, latest, depotDir };
  }
  if (installed) {
    return { state: "up-to-date", installed, latest, depotDir };
  }

  return { state: "unknown", installed, latest, depotDir };
}

/**
 * Wait until the depot folder stops growing, i.e. a download finished.
 *
 * Used by the guided console flow, where Steam (not SteamCMD) does the work.
 */
export async function waitForDepotDownload(
  profile: GameProfile,
  paths: GamePaths,
  timeoutSeconds: number,
  onTick?: (elapsed: number, bytes: number) => void,
): Promise<boolean> {
  const interval = 10;
  let elapsed = 0;
  let lastSize = -1;
  let stable = 0;

  while (elapsed < timeoutSeconds) {
    const depotDir = await findDepotDir(depotContentDirs(paths, profile));
    let size = 0;
    if (depotDir) {
      size = await directorySize(depotDir);
      if (size > 0 && size === lastSize) {
        stable += 1;
      } else {
        stable = 0;
      }
      if (stable >= 2) {
        return true;
      }
      lastSize = size;
    }
    onTick?.(elapsed, size);
    await sleep(interval * 1000);
    elapsed += interval;
  }

  return false;
}

async function directorySize(dir: string): Promise<number> {
  const result = await exec("du", ["-sk", dir], { allowFailure: true });
  const kb = Number.parseInt(result.stdout.trim().split(/\s+/)[0] ?? "0", 10);
  return Number.isFinite(kb) ? kb * 1024 : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
