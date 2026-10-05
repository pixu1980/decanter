// Known games: per-game profile data the Steam store cannot provide.
//
// `steam-mac add` learns a game's name, appid and artwork from the store, but
// not which `.exe` to launch, where the game keeps its saves, or which Wine
// registry key holds the Unity screen mode. The legacy per-game repos carried
// those values in `game.conf`; this catalog is the unified equivalent for games
// added straight from the store.
//
// Every value is a default: a CLI flag or a hand-edited `game.json` always
// wins. Games without an entry fall back to the generic profile and rely on
// executable detection after `import`.
//
// docs: docs/managing.md

import type { GameProfile, WindowMode } from "./profile.ts";

/** The profile fields a catalog entry may pre-fill. */
export type KnownGame = Partial<Omit<GameProfile, "appid" | "window" | "meta" | "hooks" | "paths">> & {
  /** The Unity screen-mode block, merged over the engine defaults. */
  window?: Partial<WindowMode>;
};

/** Games the engine can provision without a hand-written profile. */
export const KNOWN_GAMES: Record<number, KnownGame> = {
  4358690: {
    name: "Graveyard Keeper 2",
    slug: "graveyard-keeper-2",
    bundleId: "local.gravemac-keeper-2",
    envPrefix: "GK2",
    depot: 4358691,
    exe: "GraveyardKeeper2.exe",
    installSubdir: "GK2",
    dataSubdir: "users/crossover/AppData/LocalLow/Lazy Bear Games/Graveyard Keeper 2",
    manifestName: ".gk2-manifest",
    wineRuntime: "gptk-apple",
    version: "2.0.0",
    backupLabel: "GK2",
    savePatterns: ["*.dat", "*.info"],
    versionPattern: "Starting game, ver\\. [0-9A-Za-z.]+",
    window: {
      enabled: true,
      screenModeKey: "screenMode",
      regKey: "HKCU\\Software\\Lazy Bear Games\\Graveyard Keeper 2",
      settingsValue: "settings_h1277500064",
      unityModeValue: "Screenmanager Fullscreen mode_h3630240806",
    },
  },
  773580: {
    name: "Game Dev Studio",
    slug: "game-dev-studio",
    depot: 773581,
    exe: "game_dev_studio.exe",
  },
};

/** The catalog entry for an appid, if any. */
export function knownGame(appid: number): KnownGame | undefined {
  return KNOWN_GAMES[appid];
}

/** GOG games with hand-tuned settings, keyed by GOG product id. */
export const KNOWN_GOG_GAMES: Record<number, KnownGame> = {
  1207659163: {
    name: "The Settlers II - 10th Anniversary",
    slug: "the-settlers-2-10th-anniversary",
    exe: "bin/S2DNG.exe",
    // 32-bit Direct3D 9: GPTK's Wine 7.7 asserts, so use a current build and
    // give the game native d3dx9 (the effect compiler is only a stub in Wine).
    wineRuntime: "wine-devel",
    wineVersion: "11.18",
    wine: {
      tricks: ["d3dx9"],
      dllOverrides: [],
      args: [],
      virtualDesktop: "1280x720",
      env: {},
    },
  },
};

/** The catalog entry for a GOG product id, if any. */
export function knownGogGame(gogId: number): KnownGame | undefined {
  return KNOWN_GOG_GAMES[gogId];
}
