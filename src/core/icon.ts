// App icons.
//
// Primary source: the game's vertical Steam library art (a 600x900 JPEG), which
// makes a good macOS icon once squared. Fallback: the icon embedded in the
// Windows executable, extracted with icoutils. Both end up as `icon.png` (a
// 1024 preview) and `icon.icns` (the bundle icon).
//
// docs: docs/managing.md

import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { exec, isDryRun, which } from "./exec.ts";
import { exists, mkdirp, remove, writeBytes } from "./fsx.ts";
import { gogIconCandidates } from "./gog.ts";
import { log, warn } from "./log.ts";
import type { GameProfile } from "./profile.ts";
import { iconCandidates, iconCandidatesExtra, steamGridDbCandidates } from "./store.ts";

export interface IconResult {
  source: "store" | "steamgriddb" | "exe" | "placeholder" | "none";
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

  return downloadFirstImage(iconCandidates(profile.appid), assetsDir, "key-art.jpg", fetchImpl);
}

/** Download the smaller Steam artwork when the library art is missing. */
export async function downloadStoreArtExtra(
  profile: GameProfile,
  assetsDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (isDryRun()) {
    log("dry-run: fetch additional Steam artwork");
    return null;
  }

  return downloadFirstImage(iconCandidatesExtra(profile.appid), assetsDir, "extra-art.jpg", fetchImpl);
}

/** Download the game artwork from the GOG CDN; returns its path or `null`. */
export async function downloadGogArt(
  profile: GameProfile,
  assetsDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (isDryRun()) {
    log("dry-run: fetch the GOG artwork");
    return null;
  }

  // GOG games must never use the Steam/SteamGridDB art a previous run may have
  // downloaded (an appid-0 SteamGridDB lookup returns an unrelated image).
  for (const name of ["grid-art.png", "key-art.jpg", "extra-art.jpg"]) {
    const stale = join(assetsDir, name);
    if (exists(stale)) {
      await remove(stale);
    }
  }

  return downloadFirstImage(gogImages(profile), assetsDir, "gog-art.png", fetchImpl);
}

/**
 * The GOG artwork URLs of a profile, best first.
 *
 * Fresh profiles carry the whole product `images` map; older ones only kept the
 * logo and the background, which are mapped back onto their GOG keys.
 */
function gogImages(profile: GameProfile): string[] {
  const images: Record<string, string> = profile.meta.gogImages ?? {};
  if (!profile.meta.gogImages) {
    if (profile.meta.libraryImage) images.logo2x = profile.meta.libraryImage;
    if (profile.meta.headerImage) images.background = profile.meta.headerImage;
  }

  return gogIconCandidates(images);
}

/** Download SteamGridDB artwork, icons first; returns its path or `null`. */
export async function downloadSteamGridArt(
  profile: GameProfile,
  assetsDir: string,
  fetchImpl: typeof fetch = fetch,
  apiKey = "",
): Promise<string | null> {
  if (isDryRun()) {
    log("dry-run: fetch SteamGridDB artwork");
    return null;
  }
  const urls = await steamGridDbCandidates(profile.appid, apiKey, fetchImpl);

  return downloadFirstImage(urls, assetsDir, "grid-art.png", fetchImpl);
}

/** Download the first URL that returns a plausible image. */
async function downloadFirstImage(
  urls: string[],
  assetsDir: string,
  fileName: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  for (const url of urls) {
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
      const target = join(assetsDir, fileName);
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
  const square = await squareSource(source, assetsDir);
  const iconset = join(assetsDir, "icon.iconset");
  await remove(iconset);
  await mkdirp(iconset);

  for (const [name, size] of Object.entries(ICONSET_SIZES)) {
    // `-s format png` is required: sips keeps the source format otherwise, and
    // iconutil rejects an iconset whose `.png` files are actually JPEG.
    await exec("sips", ["-z", String(size), String(size), "-s", "format", "png", square, "--out", join(iconset, name)]);
  }

  const icns = join(assetsDir, "icon.icns");
  await exec("iconutil", ["-c", "icns", iconset, "-o", icns]);
  const png = join(assetsDir, "icon.png");
  await exec("sips", ["-z", "1024", "1024", "-s", "format", "png", square, "--out", png]);
  await remove(iconset);
  if (square !== source) {
    await remove(square);
  }

  return { source: "store", png, icns };
}

/** Center-crop a non-square source so the icon is not distorted. */
async function squareSource(source: string, assetsDir: string): Promise<string> {
  const probe = await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", source], { allowFailure: true });
  const width = Number.parseInt(/pixelWidth:\s*(\d+)/.exec(probe.stdout)?.[1] ?? "0", 10);
  const height = Number.parseInt(/pixelHeight:\s*(\d+)/.exec(probe.stdout)?.[1] ?? "0", 10);
  if (!width || !height || width === height) {
    return source;
  }

  const side = Math.min(width, height);
  const target = join(assetsDir, "icon-square.png");
  await exec("sips", ["-c", String(side), String(side), "-s", "format", "png", source, "--out", target]);
  return target;
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

/** A 3x5 bitmap font, enough for the first letter or digit of a game name. */
const GLYPHS: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "110", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The first letter or digit of a name, uppercased. */
export function initialOf(name: string): string {
  const match = /[a-z0-9]/i.exec(name);
  return (match?.[0] ?? "?").toUpperCase();
}

/** The glyph for one character, or `null` when the font has none. */
export function glyphFor(char: string): string[] | null {
  return GLYPHS[char.toUpperCase()] ?? null;
}

/** Encode top-down RGB pixels as a 24-bit BMP. */
export function encodeBmp(width: number, height: number, rgb: Uint8Array): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelSize);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelSize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * width * 3;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      buffer[dstRow + x * 3] = rgb[srcRow + x * 3 + 2]!;
      buffer[dstRow + x * 3 + 1] = rgb[srcRow + x * 3 + 1]!;
      buffer[dstRow + x * 3 + 2] = rgb[srcRow + x * 3]!;
    }
  }

  return buffer;
}

/** Generate a placeholder icon from the game's initial; returns its PNG. */
export async function generatePlaceholderIcon(
  profile: GameProfile,
  assetsDir: string,
): Promise<string | null> {
  if (isDryRun()) {
    log("dry-run: generate a placeholder icon");
    return null;
  }
  const size = 1024;
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    rgb[i * 3] = 0x2f;
    rgb[i * 3 + 1] = 0x3b;
    rgb[i * 3 + 2] = 0x52;
  }
  const glyph = glyphFor(initialOf(profile.name));
  if (glyph) {
    drawGlyph(rgb, size, glyph, { r: 0xff, g: 0xff, b: 0xff });
  }

  await mkdirp(assetsDir);
  const bmp = join(assetsDir, "placeholder.bmp");
  await writeBytes(bmp, encodeBmp(size, size, rgb));
  const png = join(assetsDir, "placeholder.png");
  await exec("sips", ["-s", "format", "png", bmp, "--out", png], { allowFailure: true });
  await remove(bmp);
  return exists(png) ? png : null;
}

function drawGlyph(rgb: Uint8Array, size: number, glyph: string[], color: Rgb): void {
  const scale = Math.floor((size * 0.6) / glyph.length);
  const glyphWidth = glyph[0]!.length * scale;
  const glyphHeight = glyph.length * scale;
  const offsetX = Math.floor((size - glyphWidth) / 2);
  const offsetY = Math.floor((size - glyphHeight) / 2);
  for (let gy = 0; gy < glyph.length; gy += 1) {
    const row = glyph[gy]!;
    for (let gx = 0; gx < row.length; gx += 1) {
      if (row[gx] !== "1") {
        continue;
      }
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const px = offsetX + gx * scale + x;
          const py = offsetY + gy * scale + y;
          const at = (py * size + px) * 3;
          rgb[at] = color.r;
          rgb[at + 1] = color.g;
          rgb[at + 2] = color.b;
        }
      }
    }
  }
}

/**
 * Provision the icon for a game: the artwork of the store it came from (Steam
 * library art / SteamGridDB / smaller Steam artwork, or the GOG product
 * images), then the icon embedded in the executable, then a generated
 * placeholder.
 *
 * Failure is not fatal: a game without an icon still gets a working bundle.
 */
export async function provisionIcon(
  profile: GameProfile,
  assetsDir: string,
  options: { exePath?: string; fetchImpl?: typeof fetch; imageUrl?: string } = {},
): Promise<IconResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = await loadConfig();

  if (options.imageUrl) {
    const imageUrl = options.imageUrl.startsWith("//") ? `https:${options.imageUrl}` : options.imageUrl;
    const art = await downloadFirstImage([imageUrl], assetsDir, "store-art.png", fetchImpl);
    if (art) {
      log("icon: using the store artwork");
      const result = await buildIcns(art, assetsDir);
      if (result) {
        return result;
      }
    }
  }

  const store =
    profile.store === "gog"
      ? await downloadGogArt(profile, assetsDir, fetchImpl)
      : await downloadStoreArt(profile, assetsDir, fetchImpl);
  if (store) {
    log(profile.store === "gog" ? "icon: using the GOG artwork" : "icon: using the Steam library artwork");
    const result = await buildIcns(store, assetsDir);
    if (result) {
      return result;
    }
  }

  if (profile.store !== "gog") {
    const grid = await downloadSteamGridArt(profile, assetsDir, fetchImpl, config.steamGridDbKey);
    if (grid) {
      log("icon: using SteamGridDB artwork");
      const result = await buildIcns(grid, assetsDir);
      if (result) {
        return { ...result, source: "steamgriddb" };
      }
    }

    const extra = await downloadStoreArtExtra(profile, assetsDir, fetchImpl);
    if (extra) {
      log("icon: using additional Steam artwork");
      const result = await buildIcns(extra, assetsDir);
      if (result) {
        return result;
      }
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

  const placeholder = await generatePlaceholderIcon(profile, assetsDir);
  if (placeholder) {
    log("icon: using a generated placeholder");
    const result = await buildIcns(placeholder, assetsDir);
    if (result) {
      return { ...result, source: "placeholder" };
    }
  }

  warn("icon: no artwork found — the app bundle will use the default icon");
  return { source: "none" };
}
