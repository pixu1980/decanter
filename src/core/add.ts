// Create a game profile from the Steam store.
//
// `steam-mac add "<name>"` (or `--appid N`) resolves the app, caches its
// metadata and artwork, and writes `~/.steam-mac/games/<slug>/game.json`.
//
// docs: docs/managing.md

import { storeApp, searchApp } from "./store.ts";
import { normalizeProfile, type GameProfile } from "./profile.ts";
import { gameExists, saveGame } from "./registry.ts";
import { gameAssetsDir, slugify } from "./paths.ts";
import { die, log } from "./log.ts";
import { provisionIcon } from "./icon.ts";

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
  const appName = store?.name ?? name;
  if (!appName) {
    die(`no Steam app found for id ${appid}`);
  }
  const slug = options.slug ?? slugify(appName);

  if (!options.force && (await gameExists(slug))) {
    die(`'${slug}' is already in the registry — pass --force to overwrite`);
  }

  const profile = normalizeProfile({
    name: appName,
    slug,
    appid,
    depot: options.depot ?? 0,
    exe: options.exe,
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

  if (profile.depot === 0) {
    log(`next: set the depot id (steam-mac edit ${profile.slug}), then: steam-mac setup ${profile.slug}`);
  } else {
    log(`next: steam-mac setup ${profile.slug}`);
  }

  return profile;
}
