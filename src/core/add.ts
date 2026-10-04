// Create a game profile from the Steam store.
//
// `steam-mac add "<name>"` (or `--appid N`) resolves the app, caches its
// metadata and artwork, writes `~/.steam-mac/games/<slug>/game.json`, then
// provisions the game: setup, download and import.
//
// docs: docs/managing.md

import { loadConfig } from "./config.ts";
import { gameInstalled } from "./depot.ts";
import { resolveGamePaths } from "./game.ts";
import { storeApp, searchApp } from "./store.ts";
import { normalizeProfile, type GameProfile } from "./profile.ts";
import { knownGame } from "./catalog.ts";
import { gameExists, getGame, saveGame } from "./registry.ts";
import { gameAssetsDir, slugify } from "./paths.ts";
import { die, log } from "./log.ts";
import { provisionIcon } from "./icon.ts";
import { provisionGame } from "./lifecycle.ts";

export interface AddOptions {
  name?: string;
  appid?: number;
  depot?: number;
  slug?: string;
  exe?: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
}

/** Resolve, enrich and store a new game profile. */
export async function addGame(options: AddOptions): Promise<GameProfile> {
  let appid = options.appid ?? 0;
  let name = options.name ?? "";

  if (!appid) {
    if (!name) {
      die("give a game name or --appid");
    }
    const hit = await searchApp(name, options.fetchImpl);
    if (!hit) {
      die(`no Steam app found for '${name}' (try --appid)`);
    }
    appid = hit.appid;
    name = hit.name;
  }

  const store = await storeApp(appid, options.fetchImpl);
  const known = knownGame(appid);
  const appName = store?.name || name || known?.name || "";
  if (!appName) {
    die(`no Steam app found for id ${appid}`);
  }
  const slug = options.slug ?? known?.slug ?? slugify(appName);

  if (!options.force && (await gameExists(slug))) {
    const existing = await getGame(slug);
    const config = await loadConfig();
    const paths = resolveGamePaths(existing, config);
    if (await gameInstalled(existing, paths)) {
      log(`'${slug}' is already installed — nothing to do (pass --force to re-register)`);
      return existing;
    }
    log(`'${slug}' is already registered but not installed — provisioning it again`);
  }

  const profile = normalizeProfile({
    ...known,
    name: appName,
    slug,
    appid,
    depot: options.depot ?? known?.depot ?? 0,
    exe: options.exe ?? known?.exe,
    meta: {
      headerImage: store?.headerImage,
      libraryImage: store?.libraryImage,
      developers: store?.developers,
      publishers: store?.publishers,
      releaseDate: store?.releaseDate,
      shortDescription: store?.shortDescription,
    },
  });

  await saveGame(profile);
  log(`added ${profile.name} (appid ${profile.appid}, slug ${profile.slug})`);

  const icon = await provisionIcon(profile, gameAssetsDir(profile.slug), {
    fetchImpl: options.fetchImpl,
  });
  if (icon.icns) {
    log(`icon: ${icon.icns}`);
  }

  const weakIcon = icon.source === "placeholder" || icon.source === "none";
  await provisionGame(profile.slug, { refreshIcon: weakIcon });

  return profile;
}
