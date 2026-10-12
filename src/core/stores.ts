// The store abstraction.
//
// Each store (Steam, GOG, Epic) exposes the same descriptor: how to identify a
// game, whether the profile is configured enough to download, the human name of
// the id, and the extra launch arguments a title needs. The protocols differ
// (SteamCMD depots, the Galaxy content system, Epic's BuildPatch manifest), so
// the download and import steps live in `lifecycle.ts` behind their own small
// dispatch; everything the rest of the engine reasons about is here.
//
// docs: docs/architecture.md, docs/plans/epic-support.md

import { epicGameToken, epicLaunchParameters, ensureEpicToken, epicIconCandidates } from "./epic.ts";
import { gogIconCandidates } from "./gog.ts";
import { iconCandidates } from "./store.ts";
import type { GameProfile, Store } from "./profile.ts";

/** The store artwork for a game: the cache file, its candidates and what to prune. */
export interface StoreArt {
  /** File name the chosen image is cached under. */
  file: string;
  /** Candidate URLs, best first. */
  urls: string[];
  /** Files a previous run of another store may have left behind. */
  prune: string[];
  /** What the log says when this art is used. */
  log: string;
}

/** The store-specific facts the engine shares across commands. */
export interface StoreProvider {
  id: Store;
  label: string;
  /** The identifier used for lookups (Lutris, update checks). */
  catalogId(profile: GameProfile): string | number;
  /** Is the profile configured enough to download? */
  configured(profile: GameProfile): boolean;
  /** The human name of the id, for the "missing id" warning. */
  idLabel: string;
  /** Extra launch arguments a title needs (Epic auth); `[]` for the rest. */
  launchArgs(profile: GameProfile): Promise<string[]>;
  /** The store artwork for the game icon. */
  art(profile: GameProfile): StoreArt;
}

/** The GOG artwork URLs, mapping an older profile's logo/background back onto GOG keys. */
function gogImageUrls(profile: GameProfile): string[] {
  const images: Record<string, string> = profile.meta.gogImages ?? {};
  if (!profile.meta.gogImages) {
    if (profile.meta.libraryImage) {
      images.logo2x = profile.meta.libraryImage;
    }
    if (profile.meta.headerImage) {
      images.background = profile.meta.headerImage;
    }
  }
  return gogIconCandidates(images);
}

const PRUNE_OTHER_STORES = ["grid-art.png", "key-art.jpg", "extra-art.jpg"];

/** Steam: an appid and a Windows content depot. */
const steamProvider: StoreProvider = {
  id: "steam",
  label: "Steam",
  catalogId: (profile) => profile.appid,
  configured: (profile) => profile.depot !== 0,
  idLabel: "depot id",
  launchArgs: async () => [],
  art: (profile) => ({ file: "key-art.jpg", urls: iconCandidates(profile.appid), prune: [], log: "the Steam library artwork" }),
};

/** GOG: a DRM-free product, downloaded through the Galaxy content system. */
const gogProvider: StoreProvider = {
  id: "gog",
  label: "GOG",
  catalogId: (profile) => profile.gogId,
  configured: (profile) => profile.gogId !== 0,
  idLabel: "GOG product id",
  launchArgs: async () => [],
  art: (profile) => ({
    file: "gog-art.png",
    urls: gogImageUrls(profile),
    prune: PRUNE_OTHER_STORES,
    log: "the GOG artwork",
  }),
};

/** Epic: an app name/namespace, launched with an exchange code. */
const epicProvider: StoreProvider = {
  id: "epic",
  label: "Epic",
  catalogId: (profile) => profile.epicAppName,
  configured: (profile) => profile.epicAppName !== "",
  idLabel: "Epic app name",
  launchArgs: async (profile) => {
    const tokens = await ensureEpicToken();
    const code = await epicGameToken(tokens.access_token);
    return epicLaunchParameters({
      appName: profile.epicAppName,
      namespace: profile.epicNamespace,
      accountId: tokens.account_id,
      displayName: tokens.displayName ?? "",
      exchangeCode: code,
    });
  },
  art: (profile) => ({
    file: "epic-art.png",
    urls: epicIconCandidates({ keyImages: profile.meta.epicImages }),
    prune: PRUNE_OTHER_STORES,
    log: "the Epic artwork",
  }),
};

const PROVIDERS: Record<Store, StoreProvider> = {
  steam: steamProvider,
  gog: gogProvider,
  epic: epicProvider,
};

/** The provider for a store. */
export function providerFor(store: Store): StoreProvider {
  return PROVIDERS[store];
}
