// The per-store owned-games cache.
//
// Steam can read the library from the Steam client's own caches offline; GOG and
// Epic have no usable local library on macOS, so their list is fetched from the
// API once and kept here. `list <store>` reads this first and only fetches when
// it is missing or `--refresh` is given.
//
// docs: docs/architecture.md

import { readJson, writeJson } from "./fsx.ts";
import { libraryCachePath } from "./paths.ts";
import type { Store } from "./profile.ts";
import type { GameProfile } from "./profile.ts";
import { loadConfig } from "./config.ts";
import { listGames } from "./registry.ts";
import { readAppInfo, type AppInfoEntry } from "./appinfo.ts";
import { steamLibraryCacheAppIds } from "./steamcmd.ts";

/** One owned game, the shape every store is normalised to. */
export interface LibraryGame {
  id: string;
  title: string;
  /** Extra line: the Epic app name or namespace, empty for the others. */
  detail: string;
}

interface LibraryCache {
  at: string;
  games: LibraryGame[];
}

/** The cached library, or `null` when there is none. */
export async function readLibraryCache(store: Store): Promise<LibraryGame[] | null> {
  const cache = await readJson<LibraryCache>(libraryCachePath(store));
  return cache?.games && cache.games.length > 0 ? cache.games : null;
}

/** Store the fetched library for next time. */
export async function writeLibraryCache(store: Store, games: LibraryGame[]): Promise<void> {
  await writeJson(libraryCachePath(store), { at: new Date().toISOString(), games } satisfies LibraryCache);
}

/** Read the cache, or fetch and cache; returns the games and where they came from. */
export async function libraryFor(
  store: Store,
  refresh: boolean,
  fetchGames: () => Promise<LibraryGame[]>,
): Promise<{ games: LibraryGame[]; fromCache: boolean }> {
  if (!refresh) {
    const cached = await readLibraryCache(store);
    if (cached) {
      return { games: cached, fromCache: true };
    }
  }
  const games = await fetchGames();
  await writeLibraryCache(store, games);
  return { games, fromCache: false };
}

/** One store's copy of a catalog game. */
export interface CatalogEntry {
  store: Store;
  /** appid (Steam), gogId (GOG) or Epic app name. */
  id: string;
  title: string;
  detail: string;
  /** Already in the decanter registry. */
  installed: boolean;
}

/** One catalog game, with every store that owns it. */
export interface CatalogGame {
  title: string;
  /** One entry per store that owns the game, so the player picks where to install. */
  entries: CatalogEntry[];
  /** Already in the decanter registry, from any store. */
  installed: boolean;
}

/**
 * Merge the three stores' local libraries into one sorted catalog.
 *
 * Steam always comes from the client's own caches (offline); GOG and Epic come
 * from the per-store cache `list` writes.
 */
export async function buildCatalog(): Promise<CatalogGame[]> {
  const config = await loadConfig();
  const entries: CatalogEntry[] = [];

  const appids = await steamLibraryCacheAppIds(config.steamRoot);
  const info = await readAppInfo(config.steamRoot);
  entries.push(...steamCatalogEntries(appids, info));
  for (const game of (await readLibraryCache("gog")) ?? []) {
    entries.push({ store: "gog", id: game.id, title: game.title, detail: game.detail, installed: false });
  }
  for (const game of (await readLibraryCache("epic")) ?? []) {
    entries.push({ store: "epic", id: game.id, title: game.title, detail: game.detail, installed: false });
  }

  const registered = await listGames();
  for (const entry of entries) {
    entry.installed = registered.some((profile) => matchesEntry(profile, entry));
  }
  return groupCatalog(entries);
}

/** A title key for cross-store matching: case, punctuation and spacing are noise. */
function catalogKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Group the stores' rows into one game each.
 *
 * A game owned on more than one store becomes a single row whose entries list
 * every store, so the player picks where to install it. Within a store the
 * first entry per title wins, preferring one that is already registered, which
 * also collapses the editions and repeated records a store hands back.
 */
export function groupCatalog(entries: CatalogEntry[]): CatalogGame[] {
  const groups = new Map<string, { title: string; byStore: Map<Store, CatalogEntry> }>();
  for (const entry of entries) {
    const key = catalogKey(entry.title);
    if (!key) {
      continue;
    }
    const group = groups.get(key) ?? { title: entry.title, byStore: new Map<Store, CatalogEntry>() };
    groups.set(key, group);
    const current = group.byStore.get(entry.store);
    if (!current || (!current.installed && entry.installed)) {
      group.byStore.set(entry.store, entry);
    }
  }
  return [...groups.values()]
    .map((group) => {
      const groupEntries = [...group.byStore.values()];
      return { title: group.title, entries: groupEntries, installed: groupEntries.some((entry) => entry.installed) };
    })
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

/**
 * The Steam catalog rows.
 *
 * The client's library cache also lists tools, runtimes, dedicated servers and
 * DLC; the catalog wants games, so only `common.type == Game` survives. The
 * provider list (`list steam`) is left untouched and keeps every app.
 */
export function steamCatalogEntries(appids: number[], info: Map<number, AppInfoEntry>): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const appid of appids) {
    const app = info.get(appid);
    if (app?.type?.toLowerCase() !== "game") {
      continue;
    }
    entries.push({ store: "steam", id: String(appid), title: app.name ?? String(appid), detail: "", installed: false });
  }
  return entries;
}

/** Does a registered profile correspond to a catalog entry? */
export function matchesEntry(profile: GameProfile, entry: CatalogEntry): boolean {
  if (profile.store !== entry.store) {
    return false;
  }
  if (entry.store === "steam") {
    return String(profile.appid) === entry.id;
  }
  if (entry.store === "gog") {
    return String(profile.gogId) === entry.id;
  }
  return profile.epicAppName === entry.id;
}

/** The `addGame` arguments that install a catalog entry. */
export function catalogAddArgs(entry: CatalogEntry): {
  store: Store;
  name: string;
  appid?: number;
  gogId?: number;
  epicAppName?: string;
} {
  if (entry.store === "steam") {
    return { store: "steam", name: entry.title, appid: Number(entry.id) };
  }
  if (entry.store === "gog") {
    return { store: "gog", name: entry.title, gogId: Number(entry.id) };
  }
  return { store: "epic", name: entry.title, epicAppName: entry.id };
}
