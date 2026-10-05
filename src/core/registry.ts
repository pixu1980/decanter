// The runtime registry: the games under `~/.decanter/games`.
//
// docs: docs/architecture.md

import { readdir } from "node:fs/promises";
import { gameDir, gameProfilePath, gamesDir, isSlug } from "./paths.ts";
import { mkdirp, readJson, remove, writeJson } from "./fsx.ts";
import { die } from "./log.ts";
import { type GameProfile, normalizeProfile } from "./profile.ts";

/** Every registered game, sorted by name. */
export async function listGames(): Promise<GameProfile[]> {
  let entries: string[];
  try {
    entries = await readdir(gamesDir());
  } catch {
    return [];
  }
  const games: GameProfile[] = [];
  for (const entry of entries) {
    if (!isSlug(entry)) {
      continue;
    }
    const profile = await readGame(entry);
    if (profile) {
      games.push(profile);
    }
  }

  return games.sort((a, b) => a.name.localeCompare(b.name));
}

/** Read one profile, or `null` when it is missing or malformed. */
export async function readGame(slug: string): Promise<GameProfile | null> {
  const raw = await readJson<Partial<GameProfile> & { name?: string }>(gameProfilePath(slug));
  if (!raw?.name) {
    return null;
  }

  return normalizeProfile({ ...raw, name: raw.name, slug: raw.slug ?? slug });
}

/** Read one profile, stopping with an error when it does not exist. */
export async function getGame(slug: string): Promise<GameProfile> {
  const profile = await readGame(slug);
  if (!profile) {
    die(`no game '${slug}' in the registry — see: decanter list`);
  }

  return profile;
}

/** Does a game with this slug exist? */
export async function gameExists(slug: string): Promise<boolean> {
  return (await readGame(slug)) !== null;
}

/** Create or overwrite a game's profile. */
export async function saveGame(profile: GameProfile): Promise<void> {
  await mkdirp(gameDir(profile.slug));
  await writeJson(gameProfilePath(profile.slug), profile);
}

/** Delete a game's registry folder. */
export async function removeGameRecord(slug: string): Promise<void> {
  await remove(gameDir(slug));
}

/** Find a game by exact slug, then by slug prefix, then by name. */
export async function resolveGame(query: string): Promise<GameProfile> {
  const games = await listGames();
  const exact = games.find((game) => game.slug === query);
  if (exact) {
    return exact;
  }

  const normalized = query.trim().toLowerCase();
  const byName = games.filter((game) => game.name.toLowerCase() === normalized);
  if (byName.length === 1) {
    return byName[0]!;
  }

  const byPrefix = games.filter((game) => game.slug.startsWith(normalized));
  if (byPrefix.length === 1) {
    return byPrefix[0]!;
  }
  if (byPrefix.length > 1) {
    die(`'${query}' matches several games: ${byPrefix.map((game) => game.slug).join(", ")}`);
  }

  die(`no game matches '${query}' — see: decanter list`);
}
