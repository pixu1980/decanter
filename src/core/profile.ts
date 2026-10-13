// The per-game profile (`~/.decanter/games/<slug>/game.json`).
//
// A profile is everything the engine needs to know about one game (Steam, GOG
// or Epic). It is
// created by `decanter add`, imported from a legacy `game.conf` by
// `decanter migrate`, or edited by hand.
//
// docs: docs/architecture.md

import { envPrefix as deriveEnvPrefix, slugify } from "./paths.ts";

/** Which Wine runtime a game needs. */
export type WineRuntime = "gptk" | "gptk-apple" | "wine-devel" | "wine-staging";

/** Unity games store their screen mode in the Wine registry. */
export interface WindowMode {
  enabled: boolean;
  /** JSON field holding the mode inside the settings blob. */
  screenModeKey: string;
  /** Registry key that holds the settings. */
  regKey: string;
  /** Registry value with the JSON blob (hex). */
  settingsValue: string;
  /** Unity's mirrored `Screenmanager Fullscreen mode` value. */
  unityModeValue: string;
}

/** Shell snippets for behaviour the generic engine cannot know. */
export interface GameHooks {
  /** Runs at the end of `import`, inside the Wine prefix. */
  postImport?: string;
  /** Extra doctor checks; may call `sm_check pass|warn|fail <label> [detail]`. */
  doctorExtra?: string;
}

/** Per-game Wine tweaks, applied at setup and launch. */
export interface WineSettings {
  /** winetricks verbs to install during setup (e.g. `d3dx9`). */
  tricks: string[];
  /** Extra `WINEDLLOVERRIDES` entries (e.g. `d3dx9_43=n`). */
  dllOverrides: string[];
  /** Extra arguments for the game executable. */
  args: string[];
  /** Run in a Wine virtual desktop of this size (an escapable window). */
  virtualDesktop: string;
  /** Extra environment variables for the launch. */
  env: Record<string, string>;
}

/** Artwork and store metadata cached when the game is added. */
export interface GameMeta {
  headerImage?: string;
  libraryImage?: string;
  /** Full GOG product `images` map, so `icon` can re-fetch the artwork later. */
  gogImages?: Record<string, string>;
  /** Epic catalog `keyImages`, cached so `icon` can re-fetch the artwork later. */
  epicImages?: Array<{ type?: string; url?: string }>;
  developers?: string[];
  publishers?: string[];
  releaseDate?: string;
  shortDescription?: string;
}

/** Optional per-game path overrides. */
export interface GamePaths {
  prefix?: string;
  app?: string;
  steamRoot?: string;
}

/** Which store a game comes from. */
export type Store = "steam" | "gog" | "epic";

/** A runtime configuration the game was launched with. */
export interface RuntimeSnapshot {
  wineRuntime: WineRuntime;
  /** Pinned Gcenx version for `wine-devel` / `wine-staging` (empty otherwise). */
  wineVersion: string;
  /** D3DMetal version observed for `gptk` / `gptk-apple` (empty otherwise). */
  d3dMetal: string;
  /** ISO timestamp of the launch that recorded the snapshot. */
  at: string;
}

/** Everything the engine needs about one game. */
export interface GameProfile {
  name: string;
  slug: string;
  bundleId: string;
  envPrefix: string;
  store: Store;
  appid: number;
  depot: number;
  /** GOG product id (0 for a game from another store). */
  gogId: number;
  /** Epic app name (the entitlement's `entitlementName`), empty otherwise. */
  epicAppName: string;
  /** Epic sandbox namespace. */
  epicNamespace: string;
  /** Epic catalog item id. */
  epicCatalogItemId: string;
  /** Build version recorded at the last Epic import, for update checks. */
  epicBuildVersion: string;
  exe: string;
  installSubdir: string;
  dataSubdir: string;
  manifestName: string;
  logName: string;
  modsSubdir: string;
  wineRuntime: WineRuntime;
  wineVersion: string;
  /** Runtimes the game has been launched with, oldest first. */
  runtimeHistory: RuntimeSnapshot[];
  version: string;
  minMacos: number;
  icon: string;
  backupLabel: string;
  savePatterns: string[];
  versionPattern: string;
  window: WindowMode;
  hooks: GameHooks;
  wine: WineSettings;
  meta: GameMeta;
  paths: GamePaths;
}

/** A partial profile as accepted by `normalizeProfile`; `window` may be partial. */
export type ProfileInput = Partial<Omit<GameProfile, "window">> & {
  name: string;
  window?: Partial<WindowMode>;
};

/** Fill a partial profile with sensible defaults. */
export function normalizeProfile(input: ProfileInput): GameProfile {
  const slug = input.slug ?? slugify(input.name);
  return {
    name: input.name,
    slug,
    bundleId: input.bundleId ?? `local.${slug}`,
    envPrefix: input.envPrefix ?? deriveEnvPrefix(slug),
    store: input.store ?? "steam",
    appid: input.appid ?? 0,
    depot: input.depot ?? 0,
    gogId: input.gogId ?? 0,
    epicAppName: input.epicAppName ?? "",
    epicNamespace: input.epicNamespace ?? "",
    epicCatalogItemId: input.epicCatalogItemId ?? "",
    epicBuildVersion: input.epicBuildVersion ?? "",
    exe: input.exe ?? `${slug}.exe`,
    installSubdir: input.installSubdir ?? slug,
    dataSubdir: input.dataSubdir ?? "",
    manifestName: input.manifestName ?? ".decanter-manifest",
    logName: input.logName ?? "Player.log",
    modsSubdir: input.modsSubdir ?? "Mods",
    wineRuntime: input.wineRuntime ?? "gptk",
    wineVersion: input.wineVersion ?? "",
    runtimeHistory: input.runtimeHistory ?? [],
    version: input.version ?? "0.1.0",
    minMacos: input.minMacos ?? 14,
    icon: input.icon ?? "assets/icon.icns",
    backupLabel: input.backupLabel ?? deriveEnvPrefix(slug),
    savePatterns: input.savePatterns ?? [],
    versionPattern: input.versionPattern ?? "",
    window: {
      enabled: false,
      screenModeKey: "screenMode",
      regKey: "",
      settingsValue: "",
      unityModeValue: "",
      ...input.window,
    },
    hooks: { ...input.hooks },
    wine: {
      tricks: input.wine?.tricks ?? [],
      dllOverrides: input.wine?.dllOverrides ?? [],
      args: input.wine?.args ?? [],
      virtualDesktop: input.wine?.virtualDesktop ?? "",
      env: input.wine?.env ?? {},
    },
    meta: { ...input.meta },
    paths: { ...input.paths },
  };
}

/**
 * Parse the shell `game.conf` used by the legacy per-game repos.
 *
 * Handles `KEY=value`, `KEY="quoted"`, `KEY='quoted'`, `KEY=(...)` arrays and
 * the `name() { ... }` hook functions. It is a reader, not a shell: it never
 * evaluates anything.
 */
export function parseLegacyConf(text: string): {
  values: Record<string, string | string[]>;
  functions: Record<string, string>;
} {
  const values: Record<string, string | string[]> = {};
  const functions: Record<string, string> = {};
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const functionMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{\s*$/.exec(line);
    if (functionMatch) {
      const name = functionMatch[1]!;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i] !== "}") {
        body.push(lines[i]!);
        i += 1;
      }
      functions[name] = body.join("\n");
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!assignment) {
      continue;
    }
    const key = assignment[1]!;
    values[key] = parseShellValue(assignment[2]!.trim());
  }

  return { values, functions };
}

function parseShellValue(raw: string): string | string[] {
  const value = stripTrailingComment(raw).trim();
  if (value.startsWith("(") && value.endsWith(")")) {
    return splitQuoted(value.slice(1, -1));
  }

  return unquote(value);
}

/** Remove a trailing `# comment` that is outside quotes. */
function stripTrailingComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return value.slice(0, i);
    }
  }

  return value;
}

function unquote(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    return value.slice(1, -1);
  }

  return value;
}

function splitQuoted(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of value) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function list(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value) {
    return [value];
  }

  return [];
}

/** Build a profile from the `game.conf` text of a legacy repo. */
export function profileFromLegacy(text: string, fallbackSlug: string): GameProfile {
  const { values, functions } = parseLegacyConf(text);
  const name = str(values.GAME_NAME) ?? fallbackSlug;
  const slug = str(values.GAME_SLUG) ?? fallbackSlug;
  const runtime = str(values.GAME_WINE_RUNTIME);

  return normalizeProfile({
    name,
    slug,
    bundleId: str(values.GAME_BUNDLE_ID),
    envPrefix: str(values.GAME_ENV_PREFIX),
    appid: Number(str(values.GAME_APPID) ?? 0),
    depot: Number(str(values.GAME_DEPOT) ?? 0),
    exe: str(values.GAME_EXE),
    installSubdir: str(values.GAME_INSTALL_SUBDIR),
    dataSubdir: str(values.GAME_DATA_SUBDIR),
    manifestName: str(values.GAME_MANIFEST_NAME),
    logName: str(values.GAME_LOG_NAME),
    modsSubdir: str(values.GAME_MODS_SUBDIR),
    wineRuntime:
      runtime === "wine-devel" || runtime === "wine-staging" || runtime === "gptk" || runtime === "gptk-apple"
        ? runtime
        : undefined,
    wineVersion: str(values.GAME_WINE_VERSION),
    version: str(values.GAME_VERSION),
    minMacos: Number(str(values.GAME_MIN_MACOS) ?? 14),
    icon: str(values.GAME_ICON),
    backupLabel: str(values.GAME_BACKUP_LABEL),
    savePatterns: list(values.GAME_SAVE_PATTERNS),
    versionPattern: str(values.GAME_VERSION_PATTERN),
    window: {
      enabled: str(values.GAME_WINDOW_MODE) === "1",
      screenModeKey: str(values.GAME_SCREEN_MODE_KEY) ?? "screenMode",
      regKey: str(values.GAME_REG_KEY) ?? "",
      settingsValue: str(values.GAME_SETTINGS_VALUE) ?? "",
      unityModeValue: str(values.GAME_UNITY_MODE_VALUE) ?? "",
    },
    hooks: {
      postImport: functions.game_post_import?.trim(),
      doctorExtra: functions.game_doctor_extra?.trim(),
    },
  });
}
