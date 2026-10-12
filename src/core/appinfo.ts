// Steam AppInfo cache parser (`appcache/appinfo.vdf`).
//
// The Steam client caches every app it has seen (the library, the store pages)
// in a binary file: a header, one entry per app and a string table. It carries
// the app names, so it is a keyless, offline source for `list steam` — no store
// request, no rate limit.
//
// Format (magic `0x0756442X`, version >= 39): `magic · universe`, then for v41+
// a string-table offset, then entries `appid · size · infoState · lastUpdated ·
// token(u64) · hash(20) · changeNumber · [binaryDataHash(20)] · binary KV`. The
// binary KV keys and string values are indices into the string table.
//
// Reference: xPaw/SteamAppInfo. docs: docs/architecture.md

import { readFile } from "node:fs/promises";
import { join } from "node:path";

type KvValue = KvObject | string | number;

interface KvObject {
  [key: string]: KvValue;
}

/** One depot an app declares in the AppInfo cache. */
export interface AppInfoDepot {
  id: number;
  /** `config.oslist`, lowercased and split; empty when the entry has none. */
  os: string[];
}

/** What the AppInfo cache knows about one app. */
export interface AppInfoEntry {
  name?: string;
  /** `common.type`: `Game`, `Tool`, `DLC`, `Video`, `Music`, `Demo`, ... */
  type?: string;
  /** The depots the app declares, when the cache carries them. */
  depots?: AppInfoDepot[];
}

/** Read and parse `<steamRoot>/appcache/appinfo.vdf`; empty when it is missing. */
export async function readAppInfo(steamRoot: string): Promise<Map<number, AppInfoEntry>> {
  try {
    const data = await readFile(join(steamRoot, "appcache", "appinfo.vdf"));
    return parseAppInfoEntries(data);
  } catch {
    return new Map();
  }
}

/** The appid → name map `list steam` needs. */
export async function readAppInfoNames(steamRoot: string): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (const [appid, entry] of await readAppInfo(steamRoot)) {
    if (entry.name) {
      names.set(appid, entry.name);
    }
  }
  return names;
}

/** Parse an AppInfo buffer into an appid → name map. */
export function parseAppInfo(data: Buffer): Map<number, string> {
  const names = new Map<number, string>();
  for (const [appid, entry] of parseAppInfoEntries(data)) {
    if (entry.name) {
      names.set(appid, entry.name);
    }
  }
  return names;
}

/** Parse an AppInfo buffer into an appid → entry map (name plus type). */
export function parseAppInfoEntries(data: Buffer): Map<number, AppInfoEntry> {
  const entries = new Map<number, AppInfoEntry>();
  if (data.length < 16) {
    return entries;
  }
  const magic = data.readUInt32LE(0);
  const version = magic & 0xff;
  if (magic >>> 8 !== 0x075644) {
    return entries;
  }

  let offset = 8; // magic + universe
  let pool: string[] = [];
  if (version >= 41) {
    const stringTableOffset = Number(data.readBigInt64LE(offset));
    offset += 8;
    pool = readStringTable(data, stringTableOffset);
  }

  while (offset + 8 <= data.length) {
    const appid = data.readUInt32LE(offset);
    if (appid === 0) {
      break;
    }
    const size = data.readUInt32LE(offset + 4);
    offset += 8;
    const end = offset + size;
    if (end > data.length) {
      break;
    }

    // infoState, lastUpdated, token, hash, changeNumber, [binaryDataHash]
    let cursor = offset + 4 + 4 + 8 + 20 + 4 + (version >= 40 ? 20 : 0);
    if (cursor < end && data[cursor] === 0x00) {
      // Skip the top-level object byte and its (ignored) key.
      cursor += 1 + 4;
      const { obj } = readChildren(data, cursor, end, pool);
      const appinfo = asObject(obj["appinfo"]);
      const common = asObject(obj["common"]) ?? asObject(appinfo?.["common"]);
      const name = asString(appinfo?.["name"]) ?? asString(common?.["name"]);
      const type = asString(common?.["type"]) ?? asString(appinfo?.["type"]);
      const depots = readDepots(asObject(obj["depots"]) ?? asObject(appinfo?.["depots"]));
      if (name || type || depots.length > 0) {
        const entry: AppInfoEntry = { name, type };
        if (depots.length > 0) {
          entry.depots = depots;
        }
        entries.set(appid, entry);
      }
    }
    offset = end;
  }

  return entries;
}

function asObject(value: KvValue | undefined): KvObject | undefined {
  return typeof value === "object" && value !== null ? value : undefined;
}

/** The numeric depot entries of a `depots` object; the `branches` key is skipped. */
function readDepots(depots: KvObject | undefined): AppInfoDepot[] {
  if (!depots) {
    return [];
  }
  const out: AppInfoDepot[] = [];
  for (const [key, value] of Object.entries(depots)) {
    const id = Number.parseInt(key, 10);
    if (!Number.isFinite(id)) {
      continue;
    }
    const config = asObject(asObject(value)?.["config"]);
    const os = asString(config?.["oslist"])?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    out.push({ id, os });
  }
  return out;
}

/**
 * The app's Windows content depot from the local cache, or `null`.
 *
 * Prefer a depot that names `windows`, then one with no OS list (Steam leaves it
 * empty for the base-game depot of many titles). Shared and tool depots usually
 * carry another `oslist`, so they are skipped.
 */
export function appInfoWindowsDepot(entry: AppInfoEntry | undefined): number | null {
  if (!entry?.depots || entry.depots.length === 0) {
    return null;
  }
  const windows = entry.depots.find((depot) => depot.os.includes("windows"));
  if (windows) {
    return windows.id;
  }
  const unknown = entry.depots.find((depot) => depot.os.length === 0);
  return unknown?.id ?? null;
}

function asString(value: KvValue | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function readStringTable(data: Buffer, offset: number): string[] {
  if (offset <= 0 || offset + 4 > data.length) {
    return [];
  }
  const count = data.readUInt32LE(offset);
  const pool: string[] = [];
  let cursor = offset + 4;
  for (let i = 0; i < count && cursor < data.length; i += 1) {
    const end = data.indexOf(0, cursor);
    if (end < 0) {
      break;
    }
    pool.push(data.toString("utf8", cursor, end));
    cursor = end + 1;
  }
  return pool;
}

/** Read the children of a binary KV object until its `0x08` terminator. */
function readChildren(data: Buffer, offset: number, end: number, pool: string[]): { obj: KvObject; next: number } {
  const obj: KvObject = {};
  let cursor = offset;
  while (cursor < end) {
    const type = data[cursor];
    cursor += 1;
    if (type === 0x08) {
      break;
    }
    const keyIndex = data.readUInt32LE(cursor);
    cursor += 4;
    const key = pool[keyIndex] ?? String(keyIndex);

    if (type === 0x00) {
      const sub = readChildren(data, cursor, end, pool);
      obj[key] = sub.obj;
      cursor = sub.next;
      continue;
    }

    const scalar = readScalar(data, type, cursor);
    if (!scalar) {
      break;
    }
    obj[key] = scalar.value;
    cursor = scalar.next;
  }
  return { obj, next: cursor };
}

function readScalar(data: Buffer, type: number, offset: number): { value: KvValue; next: number } | null {
  switch (type) {
    case 0x01: {
      // A string value is null-terminated UTF-8; only keys are table indices.
      const terminator = data.indexOf(0, offset);
      return { value: data.toString("utf8", offset, terminator), next: terminator + 1 };
    }
    case 0x02:
      return { value: data.readInt32LE(offset), next: offset + 4 };
    case 0x03:
      return { value: data.readFloatLE(offset), next: offset + 4 };
    case 0x04:
      return { value: data.readUInt32LE(offset), next: offset + 4 };
    case 0x05: {
      // A wide string: UTF-16LE, double-null terminated. The value is unused here.
      let cursor = offset;
      while (cursor + 1 < data.length && !(data[cursor] === 0 && data[cursor + 1] === 0)) {
        cursor += 2;
      }
      return { value: "", next: cursor + 2 };
    }
    case 0x06:
      return { value: data.readUInt32LE(offset), next: offset + 4 };
    case 0x07:
      return { value: Number(data.readBigUInt64LE(offset)), next: offset + 8 };
    case 0x0a:
      return { value: Number(data.readBigInt64LE(offset)), next: offset + 8 };
    default:
      return null;
  }
}
