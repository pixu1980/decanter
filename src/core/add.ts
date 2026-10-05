// Create a game profile from the Steam store.
//
// `steam-mac add "<name>"` (or `--appid N`) resolves the app, caches its
// metadata and artwork, writes `~/.steam-mac/games/<slug>/game.json`, then
// provisions the game: setup, download and import.
//
// docs: docs/managing.md

import { loadConfig } from "./config.ts";
import { ensureGogToken, gogLibrarySearch, gogProduct, gogSearch } from "./gog.ts";
import { resolveWindowsDepot } from "./steamcmd.ts";
import { gameInstalled } from "./depot.ts";
import { resolveGamePaths } from "./game.ts";
import { storeApp, searchApp } from "./store.ts";
import { normalizeProfile, type GameProfile, type WineRuntime } from "./profile.ts";
import { knownGame, knownGogGame } from "./catalog.ts";
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
  /** Override the runtime (defaults to the catalog entry, then `gptk`). */
  runtime?: WineRuntime;
  /** Which store to resolve the game from (default `steam`). */
  store?: "steam" | "gog";
  /** GOG product id, when adding from GOG. */
  gogId?: number;
  force?: boolean;
  fetchImpl?: typeof fetch;
}

/** Resolve, enrich and store a new game profile. */
export async function addGame(options: AddOptions): Promise<GameProfile> {
  if (options.store === "gog") {
    return addGogGame(options);
  }

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

  let depot = options.depot ?? known?.depot ?? 0;
  if (!depot) {
    // Not in the catalog: ask SteamCMD for the Windows content depot.
    const resolved = await resolveWindowsDepot(appid, (await loadConfig()).steamcmd);
    if (resolved) {
      log(`depot: resolved ${resolved} from SteamCMD`);
      depot = resolved;
    }
  }

  const profile = normalizeProfile({
    ...known,
    name: appName,
    slug,
    appid,
    depot,
    exe: options.exe ?? known?.exe,
    wineRuntime: options.runtime ?? known?.wineRuntime,
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

/** Register a GOG game: search the catalog, then store its product id. */
async function addGogGame(options: AddOptions): Promise<GameProfile> {
  let gogId = options.gogId ?? 0;
  let name = options.name ?? "";
  const token = await ensureGogToken();

  if (!gogId) {
    if (!name) {
      die("give a GOG game name or --gog-id");
    }
    // The owned library first: delisted games are not in the store search.
    let hits = await gogLibrarySearch(name, token);
    if (hits.length === 0) {
      hits = await gogSearch(name, options.fetchImpl);
    }
    if (hits.length === 0) {
      die(`no GOG product found for '${name}' (try --gog-id)`);
    }
    gogId = hits[0]!.id;
    name = hits[0]!.title;
  }

  const known = knownGogGame(gogId);
  const product = await gogProduct(gogId, token);
  const slug = options.slug ?? known?.slug ?? slugify(product.title);

  if (!options.force && (await gameExists(slug))) {
    const existing = await getGame(slug);
    log(`'${slug}' is already registered — provisioning it again`);
    await provisionGame(slug);
    return existing;
  }

  const profile = normalizeProfile({
    ...known,
    name: product.title,
    slug,
    store: "gog",
    gogId,
    exe: options.exe ?? known?.exe,
    meta: {
      headerImage: product.images?.["background"],
      libraryImage: product.images?.["logo2x"] ?? product.images?.["logo"],
      gogImages: product.images,
    },
  });

  await saveGame(profile);
  log(`added ${profile.name} (GOG ${gogId}, slug ${slug})`);

  const icon = await provisionIcon(profile, gameAssetsDir(slug), {
    fetchImpl: options.fetchImpl,
    imageUrl: product.images?.["icon"] ?? product.images?.["logo2x"] ?? product.images?.["background"],
  });
  const weakIcon = icon.source === "placeholder" || icon.source === "none";
  await provisionGame(slug, { refreshIcon: weakIcon });

  return profile;
}
