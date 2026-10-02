// Steam store lookups: search, app details and artwork URLs.
//
// The public store API needs no key and no login, which is why `steam-mac add`
// can resolve a name to an appid and fetch the artwork before anything is
// installed.
//
// docs: docs/architecture.md

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

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

/** Resolve a name to the best matching appid. */
export async function searchApp(
  term: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StoreSearchHit | null> {
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
export async function storeApp(
  appid: number,
  fetchImpl: typeof fetch = fetch,
): Promise<StoreApp | null> {
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
