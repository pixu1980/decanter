// Global settings stored in `~/.decanter/config.json`.
//
// Per-game values live in the game's own `game.json`; this file holds the
// machine-wide defaults (Steam location, Wine runtime, SteamCMD account) and the
// credential block every command reads. No credential lives in the source: the
// first-run wizard (`decanter init`, or the TUI screen it opens) writes them here.
//
// docs: docs/managing.md

import { configFile, defaultApplicationsDir, defaultSteamRoot } from "./paths.ts";
import { readJson, writeJson } from "./fsx.ts";
import { die } from "./log.ts";

/** How SteamCMD logs in when downloading a depot. */
export interface SteamCmdAccount {
  /** Download as `anonymous` (free games and demos only). */
  anonymous: boolean;
  /** Steam account name for owned games. */
  username?: string;
  /** Steam password. Prefer `decanter login`, which SteamCMD remembers. */
  password?: string;
}

/** Steam Web API credentials, used by `list steam` for the owned games. */
export interface SteamCredentials {
  /** Steam Web API key (steamcommunity.com/dev/apikey). */
  apiKey: string;
  /** SteamID64 override; auto-detected from the Steam install when empty. */
  steamId: string;
}

/** GOG Galaxy public-client credentials. */
export interface GogCredentials {
  clientId: string;
  clientSecret: string;
}

/** Epic launcher public-client credentials. */
export interface EpicCredentials {
  clientId: string;
  clientSecret: string;
}

/** Every credential the engine reads. None of these ships in the source. */
export interface Credentials {
  steam: SteamCredentials;
  /** SteamGridDB API key, used when the Steam artwork is missing. */
  steamGridDb: string;
  gog: GogCredentials;
  epic: EpicCredentials;
}

/** Machine-wide defaults. */
export interface Config {
  /** Native macOS Steam data folder. */
  steamRoot: string;
  applicationsDir: string;
  gptkApp: string;
  gptkCask: string;
  /** Directory of the mounted Apple "Evaluation environment for Windows games" DMG. */
  appleGptkSource: string;
  wineRuntime: "gptk" | "gptk-apple" | "wine-devel" | "wine-staging";
  logLines: number;
  steamcmd: SteamCmdAccount;
  credentials: Credentials;
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
    steamcmd: { anonymous: true },
    credentials: {
      steam: { apiKey: "", steamId: "" },
      steamGridDb: "",
      gog: { clientId: "", clientSecret: "" },
      epic: { clientId: "", clientSecret: "" },
    },
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Read a stored config into a full `Config`.
 *
 * A config written before the credential block moved under `credentials` keeps
 * its `steamApiKey` / `steamId` / `steamGridDbKey` top-level keys: they are folded
 * into the block so an existing install keeps working.
 */
export function normalizeConfig(stored: Record<string, unknown>, base: Config = defaultConfig()): Config {
  const creds = (stored.credentials ?? {}) as Partial<Credentials>;
  const steam = (creds.steam ?? {}) as Partial<SteamCredentials>;
  return {
    steamRoot: str(stored.steamRoot) ?? base.steamRoot,
    applicationsDir: str(stored.applicationsDir) ?? base.applicationsDir,
    gptkApp: str(stored.gptkApp) ?? base.gptkApp,
    gptkCask: str(stored.gptkCask) ?? base.gptkCask,
    appleGptkSource: str(stored.appleGptkSource) ?? base.appleGptkSource,
    wineRuntime: (str(stored.wineRuntime) as Config["wineRuntime"]) ?? base.wineRuntime,
    logLines: num(stored.logLines) ?? base.logLines,
    steamcmd: { ...base.steamcmd, ...(stored.steamcmd as SteamCmdAccount | undefined) },
    credentials: {
      steam: {
        apiKey: str(steam.apiKey) ?? str(stored.steamApiKey) ?? base.credentials.steam.apiKey,
        steamId: str(steam.steamId) ?? str(stored.steamId) ?? base.credentials.steam.steamId,
      },
      steamGridDb: str(creds.steamGridDb) ?? str(stored.steamGridDbKey) ?? base.credentials.steamGridDb,
      gog: { ...base.credentials.gog, ...(creds.gog as Partial<GogCredentials> | undefined) },
      epic: { ...base.credentials.epic, ...(creds.epic as Partial<EpicCredentials> | undefined) },
    },
  };
}

/** Read the config, filling in defaults for missing fields. */
export async function loadConfig(): Promise<Config> {
  const stored = (await readJson<Record<string, unknown>>(configFile())) ?? {};
  return normalizeConfig(stored);
}

/** Write the full config. */
export async function saveConfig(config: Config): Promise<void> {
  await writeJson(configFile(), config);
}

/** Merge a partial object into the stored config and write it back. */
export async function updateConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const next: Config = {
    ...current,
    ...patch,
    steamcmd: { ...current.steamcmd, ...patch.steamcmd },
    credentials: {
      steam: { ...current.credentials.steam, ...patch.credentials?.steam },
      steamGridDb: patch.credentials?.steamGridDb ?? current.credentials.steamGridDb,
      gog: { ...current.credentials.gog, ...patch.credentials?.gog },
      epic: { ...current.credentials.epic, ...patch.credentials?.epic },
    },
  };
  await saveConfig(next);
  return next;
}

/** One credential the wizard collects. */
export interface CredentialField {
  /** Stable id, also the wizard row id (`gog.clientId`). */
  id: string;
  /** Human label. */
  label: string;
  /** Where to get the value. */
  help: string;
  /** Whether the value is echoed back when typed. */
  secret: boolean;
  /** The current value in a config. */
  get(config: Config): string;
  /** Write a value into a config (mutates). */
  apply(config: Config, value: string): void;
}

/** Every credential the engine reads, in wizard order. */
export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    id: "steam.apiKey",
    label: "Steam Web API key",
    help: "free at steamcommunity.com/dev/apikey — needed for `list steam`",
    secret: true,
    get: (config) => config.credentials.steam.apiKey,
    apply: (config, value) => {
      config.credentials.steam.apiKey = value;
    },
  },
  {
    id: "steam.steamId",
    label: "SteamID64",
    help: "your 17-digit id (steamid.io) — auto-detected from Steam when empty",
    secret: false,
    get: (config) => config.credentials.steam.steamId,
    apply: (config, value) => {
      config.credentials.steam.steamId = value;
    },
  },
  {
    id: "steamGridDb",
    label: "SteamGridDB key",
    help: "steamgriddb.com profile → API — optional, used for missing artwork",
    secret: true,
    get: (config) => config.credentials.steamGridDb,
    apply: (config, value) => {
      config.credentials.steamGridDb = value;
    },
  },
  {
    id: "gog.clientId",
    label: "GOG client id",
    help: "the Galaxy public-client id from the gogdl / Heroic source",
    secret: false,
    get: (config) => config.credentials.gog.clientId,
    apply: (config, value) => {
      config.credentials.gog.clientId = value;
    },
  },
  {
    id: "gog.clientSecret",
    label: "GOG client secret",
    help: "the matching public-client secret from the same source",
    secret: true,
    get: (config) => config.credentials.gog.clientSecret,
    apply: (config, value) => {
      config.credentials.gog.clientSecret = value;
    },
  },
  {
    id: "epic.clientId",
    label: "Epic client id",
    help: "the launcher public-client id from the legendary source",
    secret: false,
    get: (config) => config.credentials.epic.clientId,
    apply: (config, value) => {
      config.credentials.epic.clientId = value;
    },
  },
  {
    id: "epic.clientSecret",
    label: "Epic client secret",
    help: "the matching public-client secret from the same source",
    secret: true,
    get: (config) => config.credentials.epic.clientSecret,
    apply: (config, value) => {
      config.credentials.epic.clientSecret = value;
    },
  },
];

/** The credential fields a config still has empty. */
export function missingCredentials(config: Config): CredentialField[] {
  return CREDENTIAL_FIELDS.filter((field) => field.get(config) === "");
}

/** Steam can read the owned list only with a Web API key. */
export function steamConfigured(config: Config): boolean {
  return config.credentials.steam.apiKey !== "";
}

/** GOG needs both halves of its public client. */
export function gogConfigured(config: Config): boolean {
  return config.credentials.gog.clientId !== "" && config.credentials.gog.clientSecret !== "";
}

/** Epic needs both halves of its public client. */
export function epicConfigured(config: Config): boolean {
  return config.credentials.epic.clientId !== "" && config.credentials.epic.clientSecret !== "";
}

/** GOG credentials, or a message pointing at the wizard. */
export function requireGog(config: Config): GogCredentials {
  if (!gogConfigured(config)) {
    die("GOG is not configured — run: decanter init");
  }
  return config.credentials.gog;
}

/** Epic credentials, or a message pointing at the wizard. */
export function requireEpic(config: Config): EpicCredentials {
  if (!epicConfigured(config)) {
    die("Epic is not configured — run: decanter init");
  }
  return config.credentials.epic;
}

/** Steam Web API credentials, or a message pointing at the wizard. */
export function requireSteam(config: Config): SteamCredentials {
  if (!steamConfigured(config)) {
    die("Steam is not configured — run: decanter init");
  }
  return config.credentials.steam;
}
