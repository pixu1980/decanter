// Detect a game's main executable after the depot is imported.
//
// `add` cannot know the executable of an arbitrary game, so its profile starts
// with `<slug>.exe`. After `import`, if that file is not in the game folder, the
// engine looks at the folder and picks the most plausible executable, rewrites
// the profile and rebuilds the app bundle.
//
// docs: docs/troubleshooting.md

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Executables that are never the game itself. */
const IGNORED = [
  /^unitycrashhandler\d*\.exe$/i,
  /^unins\d*\.exe$/i,
  /^setup\.exe$/i,
  /^dxsetup\.exe$/i,
  /^vcredist.*\.exe$/i,
  /^steamsetup\.exe$/i,
  /^install.*\.exe$/i,
];

/** The executable detection result. */
export interface ExecutableMatch {
  /** Chosen file name, relative to the game folder. */
  exe: string;
  /** Every `.exe` found, largest first. */
  candidates: string[];
}

/**
 * Pick the most likely game executable in a folder, or `null` when there is
 * none. A file whose name matches the game name wins; otherwise the largest
 * executable does.
 */
export async function detectExecutable(gameDir: string, gameName = ""): Promise<ExecutableMatch | null> {
  let entries: string[];
  try {
    entries = await readdir(gameDir);
  } catch {
    return null;
  }

  const found: Array<{ name: string; size: number }> = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(".exe") || IGNORED.some((pattern) => pattern.test(entry))) {
      continue;
    }
    const info = await stat(join(gameDir, entry)).catch(() => null);
    if (info?.isFile()) {
      found.push({ name: entry, size: info.size });
    }
  }
  if (found.length === 0) {
    return null;
  }

  found.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  const wanted = normalize(gameName);
  const byName = wanted ? found.find((item) => normalize(item.name.replace(/\.exe$/i, "")) === wanted) : undefined;

  return {
    exe: (byName ?? found[0]!).name,
    candidates: found.map((item) => item.name),
  };
}

/** Lowercase alphanumerics only, so `Graveyard Keeper 2` matches `GraveyardKeeper2`. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
