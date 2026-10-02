// Import a legacy per-game repo into the runtime registry.
//
// The old repos (`broken-sword-directors-cut`, `graveyard-keeper-2`,
// `office-management-101`, `the-cosmic-wheel-sisterhood`) are thin profiles.
// `steam-mac migrate <path>` reads their `game.conf`, copies the icon and writes
// the equivalent `game.json`.
//
// docs: docs/managing.md

import { basename, join } from "node:path";
import { copyIfExists, mkdirp, readText } from "./fsx.ts";
import { die, log, warn } from "./log.ts";
import { gameAssetsDir } from "./paths.ts";
import { profileFromLegacy } from "./profile.ts";
import { gameExists, saveGame } from "./registry.ts";

export interface MigrateOptions {
  slug?: string;
  force?: boolean;
}

/** Migrate one legacy repo folder. */
export async function migrateRepo(path: string, options: MigrateOptions = {}) {
  const conf = await readText(join(path, "game.conf"));
  if (!conf) {
    die(`no game.conf found in ${path}`);
  }

  const fallbackSlug = options.slug ?? basename(path);
  const profile = profileFromLegacy(conf, fallbackSlug);

  if (!options.force && (await gameExists(profile.slug))) {
    warn(`${profile.slug} is already in the registry — skipping (pass --force to overwrite)`);
    return profile;
  }

  await saveGame(profile);

  const assets = gameAssetsDir(profile.slug);
  await mkdirp(assets);
  await copyIfExists(join(path, "assets/icon.icns"), join(assets, "icon.icns"));
  await copyIfExists(join(path, "assets/icon.png"), join(assets, "icon.png"));

  log(`migrated ${profile.name} → ${profile.slug}`);
  return profile;
}
