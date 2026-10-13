// Steam store lookups: search, app details and artwork URLs.
//
// The public store API needs no key and no login, which is why `decanter add`
// can resolve a name to an appid and fetch the artwork before anything is
// installed.
//
// docs: docs/architecture.md

import { die } from "./log.ts";

/** The subset of a store app this project uses. */
export interface StoreApp {
  appid: number;
  name: string;
  headerImage?: string;
  libraryImage?: string;
  shortDescription?: string;
  developers?: string[];
  publishers?: string[];
  releaseDate?: string;
  isFree?: boolean;
}

/** One search hit. */
export interface StoreSearchHit {
  appid: number;
  name: string;
}

const STORE = "https://store.steampowered.com";

/** URL of the store search endpoint. */
export function searchUrl(term: string): string {
  return `${STORE}/api/storesearch/?term=${encodeURIComponent(term)}&cc=us&l=en`;
}

/** URL of the app details endpoint (basic fields only). */
export function detailsUrl(appid: number): string {
  return `${STORE}/api/appdetails?appids=${appid}&filters=basic&l=en`;
}

/**
 * Artwork candidates for a game, best first.
 *
 * The vertical `library_600x900` art makes the best app icon; the wide header
 * is the last resort. Both CDN hostnames are tried because older games only
 * exist on one of them.
 */
export function iconCandidates(appid: number): string[] {
  const assets = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
  const legacy = "https://cdn.cloudflare.steamstatic.com/steam/apps";
  return [
    `${assets}/${appid}/library_600x900_2x.jpg`,
    `${assets}/${appid}/library_600x900.jpg`,
    `${assets}/${appid}/library_hero.jpg`,
    `${assets}/${appid}/capsule_616x353.jpg`,
    `${legacy}/${appid}/library_600x900.jpg`,
    `${legacy}/${appid}/header.jpg`,
  ];
}

/**
 * Extra Steam CDN artwork, tried after the library art and SteamGridDB.
 *
 * Small logos and capsules survive when the big library art is missing, and
 * the older `steamcdn-a` host still serves games the newer hosts dropped.
 */
export function iconCandidatesExtra(appid: number): string[] {
  const assets = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
  const legacy = "https://cdn.cloudflare.steamstatic.com/steam/apps";
  const akamai = "https://steamcdn-a.akamaihd.net/steam/apps";
  return [
    `${assets}/${appid}/logo.png`,
    `${assets}/${appid}/capsule_231x87.jpg`,
    `${legacy}/${appid}/logo.png`,
    `${legacy}/${appid}/capsule_616x353.jpg`,
    `${akamai}/${appid}/header.jpg`,
    `${akamai}/${appid}/capsule_231x87.jpg`,
  ];
}

/** One SteamGridDB artwork entry. */
interface SteamGridDbEntry {
  url?: string;
  mime?: string;
}

/**
 * SteamGridDB artwork candidates, square icons first then vertical grids.
 *
 * The API needs a bearer token. Entries sips cannot read (`.ico`) are dropped
 * so the caller never wastes a download on them. Returns `[]` on any failure,
 * because a missing icon must never stop the rest of the pipeline.
 */
export async function steamGridDbCandidates(
  appid: number,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  if (!apiKey) {
    return [];
  }
  const base = "https://www.steamgriddb.com/api/v2";
  const headers = { Authorization: `Bearer ${apiKey}` };
  const icons = await steamGridDbLookup(`${base}/icons/steam/${appid}`, headers, fetchImpl);
  const grids = await steamGridDbLookup(
    `${base}/grids/steam/${appid}?dimensions=600x900,342x482,660x930&types=static&nsfw=false&humor=false`,
    headers,
    fetchImpl,
  );
  return [...icons, ...grids];
}

async function steamGridDbLookup(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  try {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as { success?: boolean; data?: SteamGridDbEntry[] };
    if (!body.success || !Array.isArray(body.data)) {
      return [];
    }
    return body.data.filter((entry) => usableArt(entry)).map((entry) => entry.url as string);
  } catch {
    return [];
  }
}

function usableArt(entry: SteamGridDbEntry): boolean {
  if (typeof entry.url !== "string") {
    return false;
  }
  if (!entry.mime) {
    return true;
  }
  return entry.mime.startsWith("image/png") || entry.mime.startsWith("image/jpeg");
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

/** Resolve a name to the best matching appid. */
export async function searchApp(term: string, fetchImpl: typeof fetch = fetch): Promise<StoreSearchHit | null> {
  const response = await fetchImpl(searchUrl(term));
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { items?: Array<{ id?: number; name?: string }> };
  const first = body.items?.[0];
  if (!first?.id || !first.name) {
    return null;
  }

  return { appid: first.id, name: first.name };
}

/** Fetch the store details of one app. */
export async function storeApp(appid: number, fetchImpl: typeof fetch = fetch): Promise<StoreApp | null> {
  const response = await fetchImpl(detailsUrl(appid));
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as Record<
    string,
    {
      success?: boolean;
      data?: {
        name?: string;
        header_image?: string;
        capsule_image?: string;
        short_description?: string;
        developers?: unknown;
        publishers?: unknown;
        release_date?: { date?: string };
        is_free?: boolean;
      };
    }
  >;
  const entry = body[String(appid)];
  if (!entry?.success || !entry.data?.name) {
    return null;
  }
  const data = entry.data;

  return {
    appid,
    name: data.name ?? String(appid),
    headerImage: data.header_image,
    libraryImage: iconCandidates(appid)[0],
    shortDescription: data.short_description,
    developers: asStringArray(data.developers),
    publishers: asStringArray(data.publishers),
    releaseDate: data.release_date?.date,
    isFree: data.is_free,
  };
}

/** One owned game from the Steam Web API. */
export interface SteamOwnedGame {
  appid: number;
  name: string;
}

/**
 * Every game the account owns, through the Steam Web API.
 *
 * Needs a key from steampowered.com/dev/apikey, the account's SteamID64 and a
 * profile whose game details are public; the API returns the full owned list
 * with names, which the local Steam data cannot.
 */
export async function steamOwnedGames(
  apiKey: string,
  steamid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamOwnedGame[]> {
  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}` +
    `&steamid=${encodeURIComponent(steamid)}&include_appinfo=1&include_played_free_games=1&format=json`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    die(`Steam Web API failed (${response.status}) — check the key and that the profile game list is public`);
  }
  const data = (await response.json()) as { response?: { games?: Array<{ appid?: number; name?: string }> } };
  return (data.response?.games ?? [])
    .filter((game): game is SteamOwnedGame => typeof game.appid === "number" && typeof game.name === "string")
    .sort((a, b) => a.name.localeCompare(b.name));
}
