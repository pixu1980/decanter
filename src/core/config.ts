// Global settings stored in `~/.decanter/config.json`.
//
// Per-game values live in the game's own `game.json`; this file only holds
// machine-wide defaults (Steam location, Wine runtime, SteamCMD account).
//
// docs: docs/managing.md

import { configFile, defaultApplicationsDir, defaultSteamRoot } from "./paths.ts";
import { readJson, writeJson } from "./fsx.ts";

/** How SteamCMD logs in when downloading a depot. */
export interface SteamCmdAccount {
  /** Download as `anonymous` (free games and demos only). */
  anonymous: boolean;
  /** Steam account name for owned games. */
  username?: string;
  /** Steam password. Prefer `decanter login`, which SteamCMD remembers. */
  password?: string;
}

/** Machine-wide defaults. */
export interface Config {
  steamRoot: string;
  applicationsDir: string;
  gptkApp: string;
  gptkCask: string;
  /** Directory of the mounted Apple "Evaluation environment for Windows games" DMG. */
  appleGptkSource: string;
  wineRuntime: "gptk" | "gptk-apple" | "wine-devel" | "wine-staging";
  logLines: number;
  /** SteamGridDB API key, used when the Steam artwork is missing. */
  steamGridDbKey: string;
  steamcmd: SteamCmdAccount;
}

/** Defaults used when a field is absent from the file. */
export function defaultConfig(): Config {
  return {
    steamRoot: defaultSteamRoot(),
    applicationsDir: defaultApplicationsDir(),
    gptkApp: "/Applications/Game Porting Toolkit.app",
    gptkCask: "gcenx/wine/game-porting-toolkit",
    appleGptkSource: "",
    wineRuntime: "gptk",
    logLines: 80,
    steamGridDbKey: "REDACTED",
    steamcmd: { anonymous: true },
  };
}

/** Read the config, filling in defaults for missing fields. */
export async function loadConfig(): Promise<Config> {
  const stored = (await readJson<Partial<Config>>(configFile())) ?? {};
  const base = defaultConfig();
  return {
    ...base,
    ...stored,
    steamcmd: { ...base.steamcmd, ...stored.steamcmd },
  };
}

/** Write the full config. */
export async function saveConfig(config: Config): Promise<void> {
  await writeJson(configFile(), config);
}

/** Merge a partial object into the stored config and write it back. */
export async function updateConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const next: Config = { ...current, ...patch, steamcmd: { ...current.steamcmd, ...patch.steamcmd } };
  await saveConfig(next);
  return next;
}
