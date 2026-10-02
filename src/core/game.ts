// Derived paths for one game.
//
// The prefix, app bundle and Steam folder can be overridden per game, in
// `game.json` or through the game's environment prefix (e.g. `GK2_PREFIX`),
// which keeps the legacy wrappers scriptable.
//
// docs: docs/architecture.md

import { join } from "node:path";
import type { Config } from "./config.ts";
import { expandPath, defaultPrefixDir } from "./paths.ts";
import type { GameProfile } from "./profile.ts";

/** Every path the engine needs for one game. */
export interface GamePaths {
  prefix: string;
  app: string;
  steamRoot: string;
  gameDir: string;
  dataDir: string;
  playerLog: string;
  modsDir: string;
}

function envOverride(profile: GameProfile, suffix: string): string | undefined {
  return process.env[`${profile.envPrefix}_${suffix}`];
}

/** Compute the resolved paths for a game. */
export function resolveGamePaths(profile: GameProfile, config: Config): GamePaths {
  const prefix = expandPath(
    envOverride(profile, "PREFIX") ?? profile.paths.prefix ?? defaultPrefixDir(profile.slug),
  );
  const app = expandPath(
    envOverride(profile, "APP") ??
      profile.paths.app ??
      join(config.applicationsDir, `${profile.name}.app`),
  );
  const steamRoot = expandPath(
    envOverride(profile, "STEAM_ROOT") ?? profile.paths.steamRoot ?? config.steamRoot,
  );

  const gameDir = join(prefix, "drive_c", profile.installSubdir);
  const dataDir = profile.dataSubdir ? join(prefix, "drive_c", profile.dataSubdir) : "";

  return {
    prefix,
    app,
    steamRoot,
    gameDir,
    dataDir,
    playerLog: dataDir ? join(dataDir, profile.logName) : "",
    modsDir: dataDir ? join(dataDir, profile.modsSubdir) : "",
  };
}

/** The in-prefix path of the Windows Steam client, used by the optional mode. */
export function windowsSteamExe(prefix: string): string {
  return join(prefix, "drive_c", "Program Files (x86)", "Steam", "steam.exe");
}

/** The `C:\\...` form of the Windows Steam executable. */
export const WINDOWS_STEAM_ARG = "C:\\Program Files (x86)\\Steam\\steam.exe";
