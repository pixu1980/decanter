// Filesystem layout of the runtime registry.
//
// Everything lives under `~/.steam-mac` (override with `SM_HOME`). The repo
// itself holds no game profiles: a game is created at runtime by `steam-mac add`
// or `steam-mac migrate`.
//
// docs: docs/architecture.md

import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Root of the runtime registry. `SM_HOME` makes it testable. */
export function smHome(): string {
  return process.env.SM_HOME ?? join(homedir(), ".steam-mac");
}

/** Directory holding one folder per registered game. */
export function gamesDir(): string {
  return join(smHome(), "games");
}

/** Folder for a single game. */
export function gameDir(slug: string): string {
  return join(gamesDir(), slug);
}

/** The game's profile file. */
export function gameProfilePath(slug: string): string {
  return join(gameDir(slug), "game.json");
}

/** File recording the installed depot manifest id. */
export function gameManifestPath(slug: string): string {
  return join(gameDir(slug), "manifest");
}

/** Folder holding the game's icon assets. */
export function gameAssetsDir(slug: string): string {
  return join(gameDir(slug), "assets");
}

/** Pinned Gcenx Wine builds fetched by `setup`. */
export function wineDir(): string {
  return join(smHome(), "wine");
}

/** Install folder of one Wine build. */
export function wineBuildDir(flavor: string, version: string): string {
  return join(wineDir(), `wine-${flavor}-${version}`);
}

/** App built by overlaying Apple's DMG D3DMetal onto a Gcenx loader. */
export function appleGptkAppDir(): string {
  return join(wineDir(), "gptk-apple", "Game Porting Toolkit.app");
}

/** Local SteamCMD installation. */
export function steamcmdDir(): string {
  return join(smHome(), "steamcmd");
}

/**
 * Isolated HOME for SteamCMD.
 *
 * SteamCMD writes to `$HOME/Library/Application Support/Steam`, which is the
 * native Steam client's folder. Pointing HOME here keeps SteamCMD's config and
 * depot downloads away from the client.
 */
export function steamcmdHome(): string {
  return join(steamcmdDir(), "home");
}

/** CLI/TUI log files. */
export function logsDir(): string {
  return join(smHome(), "logs");
}

/** Global settings file. */
export function configFile(): string {
  return join(smHome(), "config.json");
}

/** Native macOS Steam data folder. */
export function defaultSteamRoot(): string {
  return join(homedir(), "Library", "Application Support", "Steam");
}

/** Where `.app` bundles are installed. */
export function defaultApplicationsDir(): string {
  return join(homedir(), "Applications");
}

/** Wine prefix for a game. */
export function defaultPrefixDir(slug: string): string {
  return join(homedir(), "Games", `${slug}-prefix`);
}

/** Expand a leading `~` and make a path absolute. */
export function expandPath(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return resolve(value);
}

/** A slug is a lowercase, dash-separated identifier safe as a folder name. */
export function isSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/** `Graveyard Keeper 2` → `graveyard-keeper-2`. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** `graveyard-keeper-2` → `GK2` (environment prefix for legacy profiles). */
export function envPrefix(slug: string): string {
  const out = slug
    .split("-")
    .filter(Boolean)
    .map((token) => (/^\d+$/.test(token) ? token : token[0]!.toUpperCase()))
    .join("");

  return out || "SM";
}
