// Lutris community Wine settings.
//
// The Lutris API exposes each game's installer scripts as parsed JSON with the
// community's winetricks and DLL overrides, and maps Steam appids / GOG ids via
// `provider_games`. We merge them into the profile as a best-effort enrichment
// on top of the local heuristics.
//
// docs: docs/managing.md

export interface LutrisConfig {
  tricks: string[];
  dllOverrides: string[];
}

interface LutrisProviderGame {
  service: string;
  slug: string;
}

interface LutrisScript {
  winetricks?: string | string[];
  wine?: { dll_overrides?: Record<string, string> };
}

export interface LutrisInstaller {
  script?: LutrisScript;
}

interface LutrisGame {
  slug: string;
  provider_games?: LutrisProviderGame[];
}

interface LutrisDetail {
  installers?: LutrisInstaller[];
}

/** Extract the winetricks and DLL overrides from installer scripts. */
export function parseLutrisInstallers(installers: LutrisInstaller[]): LutrisConfig {
  const tricks = new Set<string>();
  const overrides = new Set<string>();
  for (const installer of installers) {
    const script = installer.script ?? {};
    const list = Array.isArray(script.winetricks)
      ? script.winetricks
      : script.winetricks
        ? [script.winetricks]
        : [];
    for (const trick of list) {
      if (trick) {
        tricks.add(trick);
      }
    }
    for (const [key, value] of Object.entries(script.wine?.dll_overrides ?? {})) {
      overrides.add(`${key}=${value}`);
    }
  }
  return { tricks: [...tricks], dllOverrides: [...overrides] };
}

/** Look up a game's community Wine settings, or `null`. */
export async function lutrisLookup(
  store: "steam" | "gog",
  id: number,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LutrisConfig | null> {
  if (!id || !name) {
    return null;
  }
  try {
    for (const query of lutrisQueries(name)) {
      const game = await findLutrisGame(query, store, id, fetchImpl);
      if (!game) {
        continue;
      }
      const detail = await fetchImpl(`https://lutris.net/api/games/${game.slug}?format=json`);
      if (!detail.ok) {
        return null;
      }
      const data = (await detail.json()) as LutrisDetail;
      return parseLutrisInstallers(data.installers ?? []);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Query variants, from exact to loose.
 *
 * The Lutris search is literal, so `The Settlers® 2: 10th Anniversary` matches
 * nothing while `The Settlers` reaches the game whose `provider_games` carries
 * the GOG id (its title spells `II`, not `2`).
 */
export function lutrisQueries(name: string): string[] {
  const cleaned = name
    .replace(/[®™©]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  const candidates = [
    name,
    cleaned,
    cleaned.replace(/^The\s+/i, ""),
    words.slice(0, 3).join(" "),
    words.slice(0, 2).join(" "),
  ];
  return [...new Set(candidates.filter((query) => query.length >= 4))];
}

/** Search the Lutris catalog (a few pages) for the game carrying `id`. */
async function findLutrisGame(
  query: string,
  store: "steam" | "gog",
  id: number,
  fetchImpl: typeof fetch,
): Promise<LutrisGame | null> {
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetchImpl(
      `https://lutris.net/api/games?format=json&search=${encodeURIComponent(query)}&page=${page}`,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { results?: LutrisGame[]; next?: string | null };
    const results = data.results ?? [];
    const match = results.find((entry) =>
      (entry.provider_games ?? []).some(
        (provider) => provider.service === store && provider.slug === String(id),
      ),
    );
    if (match) {
      return match;
    }
    if (!data.next || results.length === 0) {
      break;
    }
  }
  return null;
}
