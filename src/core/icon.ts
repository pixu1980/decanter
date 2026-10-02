// App icons.
//
// Primary source: the game's vertical Steam library art (a 600x900 JPEG), which
// makes a good macOS icon once squared. Fallback: the icon embedded in the
// Windows executable, extracted with icoutils. Both end up as `icon.png` (a
// 1024 preview) and `icon.icns` (the bundle icon).
//
// docs: docs/managing.md

import { join } from "node:path";
import { exec, isDryRun, which } from "./exec.ts";
import { exists, mkdirp, remove, writeBytes } from "./fsx.ts";
import { log, warn } from "./log.ts";
import type { GameProfile } from "./profile.ts";
import { iconCandidates } from "./store.ts";

export interface IconResult {
  source: "store" | "exe" | "none";
  png?: string;
  icns?: string;
}

/** Sizes required in a macOS `.iconset`. */
export const ICONSET_SIZES: Record<string, number> = {
  "icon_16x16.png": 16,
  "icon_16x16@2x.png": 32,
  "icon_32x32.png": 32,
  "icon_32x32@2x.png": 64,
  "icon_128x128.png": 128,
  "icon_128x128@2x.png": 256,
  "icon_256x256.png": 256,
  "icon_256x256@2x.png": 512,
  "icon_512x512.png": 512,
  "icon_512x512@2x.png": 1024,
};

/** Are the macOS icon tools available? */
export function hasIconTools(): boolean {
  return which("sips") !== null && which("iconutil") !== null;
}

/** Download the best store image for a game; returns its path or `null`. */
export async function downloadStoreArt(
  profile: GameProfile,
  assetsDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (isDryRun()) {
    log("dry-run: fetch the Steam library artwork");
    return null;
  }
  for (const url of iconCandidates(profile.appid)) {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength < 1024) {
        continue;
      }
      await mkdirp(assetsDir);
      const target = join(assetsDir, "key-art.jpg");
      await writeBytes(target, bytes);
      return target;
    } catch {
      continue;
    }
  }

  return null;
}

/** Build `icon.png` and `icon.icns` from a square-able source image. */
export async function buildIcns(source: string, assetsDir: string): Promise<IconResult | null> {
  if (!hasIconTools()) {
    warn("sips/iconutil not found — skipping icon generation");
    return null;
  }
  if (!exists(source)) {
    return null;
  }

  await mkdirp(assetsDir);
  const iconset = join(assetsDir, "icon.iconset");
  await remove(iconset);
  await mkdirp(iconset);

  for (const [name, size] of Object.entries(ICONSET_SIZES)) {
    await exec("sips", ["-z", String(size), String(size), source, "--out", join(iconset, name)]);
  }

  const icns = join(assetsDir, "icon.icns");
  await exec("iconutil", ["-c", "icns", iconset, "-o", icns]);
  const png = join(assetsDir, "icon.png");
  await exec("sips", ["-z", "1024", "1024", source, "--out", png]);
  await remove(iconset);

  return { source: "store", png, icns };
}

/** Extract the largest icon embedded in a Windows executable. */
export async function extractExeIcon(exePath: string, assetsDir: string): Promise<string | null> {
  if (isDryRun()) {
    log("dry-run: extract the icon from the game executable");
    return null;
  }
  if (which("wrestool") === null || which("icotool") === null) {
    warn("icoutils not found — install it with: brew install icoutils");
    return null;
  }
  if (!exists(exePath)) {
    return null;
  }

  await mkdirp(assetsDir);
  const ico = join(assetsDir, "game.ico");
  const extracted = join(assetsDir, "exe-icons");
  await remove(extracted);
  await mkdirp(extracted);

  const dump = await exec("/bin/zsh", ["-c", `wrestool -x -t 14 ${JSON.stringify(exePath)} > ${JSON.stringify(ico)}`]);
  if (dump.status !== 0) {
    return null;
  }
  const expand = await exec("/bin/zsh", ["-c", `cd ${JSON.stringify(extracted)} && icotool -x ${JSON.stringify(ico)}`], {
    allowFailure: true,
  });
  if (expand.status !== 0) {
    return null;
  }

  const source = await largestPng(extracted);
  await remove(ico);
  return source;
}

async function largestPng(dir: string): Promise<string | null> {
  const listing = await exec("/bin/zsh", ["-c", `ls -S ${JSON.stringify(dir)}/*.png 2>/dev/null | head -n 1`], {
    allowFailure: true,
  });
  const first = listing.stdout.trim();
  return first || null;
}

/**
 * Provision the icon for a game: store art first, embedded exe icon second.
 *
 * Failure is not fatal: a game without an icon still gets a working bundle.
 */
export async function provisionIcon(
  profile: GameProfile,
  assetsDir: string,
  options: { exePath?: string; fetchImpl?: typeof fetch } = {},
): Promise<IconResult> {
  const store = await downloadStoreArt(profile, assetsDir, options.fetchImpl);
  if (store) {
    log("icon: using the Steam library artwork");
    const result = await buildIcns(store, assetsDir);
    if (result) {
      return result;
    }
  }

  if (options.exePath) {
    const fromExe = await extractExeIcon(options.exePath, assetsDir);
    if (fromExe) {
      log("icon: using the icon embedded in the game executable");
      const result = await buildIcns(fromExe, assetsDir);
      if (result) {
        return { ...result, source: "exe" };
      }
    }
  }

  warn("icon: no artwork found — the app bundle will use the default icon");
  return { source: "none" };
}
