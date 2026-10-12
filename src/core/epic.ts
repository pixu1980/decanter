// Epic Games Store integration.
//
// Reference implementations: `legendary` (github.com/derrod/legendary) and the
// endpoint docs in `MixV2/EpicResearch`. Epic is an OAuth login with the public
// launcher client, JSON REST for entitlements/catalog/assets, and a content
// delivery of a binary BuildPatch manifest plus hashed chunks.
//
// docs: docs/adr/017-epic.md, docs/architecture.md

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { isDryRun } from "./exec.ts";
import { mkdirp, readJson, writeBytes, writeJson } from "./fsx.ts";
import { die, log } from "./log.ts";
import { epicAuthPath, epicDownloadsDir } from "./paths.ts";
import type { EpicCredentials } from "./config.ts";

export const EPIC_ACCOUNT = "https://account-public-service-prod03.ol.epicgames.com";
export const EPIC_LAUNCHER = "https://launcher-public-service-prod06.ol.epicgames.com";
export const EPIC_ENTITLEMENTS = "https://entitlement-public-service-prod08.ol.epicgames.com";
export const EPIC_CATALOG = "https://catalog-public-service-prod06.ol.epicgames.com";
export const EPIC_LIBRARY = "https://library-service.live.use1a.on.epicgames.com";
export const EPIC_CDN = "https://download.epicgames.com";
const USER_AGENT = "EpicGamesLauncher/14.0.8-22004686+++Portal+Release-Live";

/** A stored Epic OAuth session. */
export interface EpicTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  /** Epic account id, used by the entitlements endpoint. */
  account_id: string;
  displayName?: string;
  /** Unix seconds when the token was issued. */
  loginTime: number;
}

// --- auth ---------------------------------------------------------------------

/** The URL the user opens to log in; the page returns an `authorizationCode`. */
export function epicLoginUrl(credentials: EpicCredentials): string {
  const redirect = `https://www.epicgames.com/id/api/redirect?clientId=${credentials.clientId}&responseType=code`;
  return `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(redirect)}`;
}

/**
 * Pull the authorization code out of what the login page printed.
 *
 * The redirect page shows a JSON body with `authorizationCode`; a raw code or a
 * `?code=` URL is accepted too.
 */
export function extractEpicCode(input: string): string {
  const value = input.trim();
  const json = /"authorizationCode"\s*:\s*"([^"]+)"/.exec(value);
  if (json) {
    return json[1]!;
  }
  const url = /[?&]code=([^&\s]+)/.exec(value);
  return url ? decodeURIComponent(url[1]!) : value;
}

function basicAuth(credentials: EpicCredentials): string {
  return Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
}

async function requestTokens(
  credentials: EpicCredentials,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<EpicTokens> {
  const response = await fetchImpl(`${EPIC_ACCOUNT}/account/api/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `basic ${basicAuth(credentials)}`,
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ token_type: "eg1", ...params }).toString(),
  });
  if (!response.ok) {
    const body = await response.text();
    die(`Epic login failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as Omit<EpicTokens, "loginTime">;
  const tokens: EpicTokens = { ...data, loginTime: Date.now() / 1000 };
  await writeJson(epicAuthPath(), tokens);
  return tokens;
}

/** Exchange the login code for tokens and store them. */
export async function epicExchangeCode(credentials: EpicCredentials, code: string): Promise<EpicTokens> {
  return requestTokens(credentials, { grant_type: "authorization_code", code });
}

/** Refresh an expired session. Returns `null` when the refresh token is dead. */
export async function epicRefresh(credentials: EpicCredentials, refreshToken: string): Promise<EpicTokens | null> {
  try {
    return await requestTokens(credentials, { grant_type: "refresh_token", refresh_token: refreshToken });
  } catch {
    return null;
  }
}

/** Stored tokens, or `null`. */
export async function loadEpicTokens(): Promise<EpicTokens | null> {
  return readJson<EpicTokens>(epicAuthPath());
}

/** A valid access token, refreshing when needed. Dies when not logged in. */
export async function ensureEpicToken(credentials: EpicCredentials): Promise<EpicTokens> {
  let tokens = await loadEpicTokens();
  if (!tokens) {
    die("not logged in to Epic — run: decanter login epic");
  }
  if (Date.now() / 1000 >= tokens.loginTime + tokens.expires_in) {
    const refreshed = await epicRefresh(credentials, tokens.refresh_token);
    if (!refreshed) {
      die("Epic session expired — run: decanter login epic");
    }
    tokens = refreshed;
  }
  return tokens;
}

// --- API ----------------------------------------------------------------------

async function epicGet<T>(url: string, token: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    die(`Epic request failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

/** Fetch an Epic URL as bytes, with the bearer token. */
export async function epicBuffer(url: string, token: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    die(`Epic download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** The images and title of a catalog item. */
export interface EpicCatalogItem {
  title?: string;
  developer?: string;
  keyImages?: Array<{ type?: string; url?: string }>;
}

/** Normalize a title or app name for matching: case- and punctuation-insensitive. */
export function normalizeEpicName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** One owned game with its display title resolved from the catalog. */
export interface EpicOwnedGame {
  appName: string;
  namespace: string;
  catalogItemId: string;
  title: string;
}

/** One record of the Epic library: the app name plus its display title. */
interface EpicLibraryRecord {
  appName?: string;
  namespace?: string;
  catalogItemId?: string;
  sandboxName?: string;
}

/**
 * The games in the account's Epic library.
 *
 * The library endpoint is the right source: it carries the app name (often a
 * codename) and `sandboxName`, the title a user recognises, so no per-game
 * catalog lookup is needed.
 */
export async function epicOwnedGames(tokens: EpicTokens): Promise<EpicOwnedGame[]> {
  const games: EpicOwnedGame[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const url = `${EPIC_LIBRARY}/library/api/public/items?includeMetadata=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await epicGet<{ records?: EpicLibraryRecord[]; responseMetadata?: { nextCursor?: string } }>(
      url,
      tokens.access_token,
    );
    for (const record of page.records ?? []) {
      if (!record.appName || !record.namespace || !record.catalogItemId) {
        continue;
      }
      // The library returns the same entitlement more than once across pages.
      if (seen.has(record.appName)) {
        continue;
      }
      seen.add(record.appName);
      games.push({
        appName: record.appName,
        namespace: record.namespace,
        catalogItemId: record.catalogItemId,
        title: record.sandboxName ?? record.appName,
      });
    }
    cursor = page.responseMetadata?.nextCursor;
    if (!cursor) {
      break;
    }
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

/** Pick the owned game that best matches a query (title or app name). */
export function findOwnedGame(games: EpicOwnedGame[], query: string): EpicOwnedGame | null {
  const wanted = normalizeEpicName(query);
  if (!wanted) {
    return null;
  }
  return (
    games.find((game) => normalizeEpicName(game.title) === wanted) ??
    games.find((game) => normalizeEpicName(game.appName) === wanted) ??
    games.find((game) => normalizeEpicName(game.title).includes(wanted)) ??
    games.find((game) => normalizeEpicName(game.appName).includes(wanted)) ??
    null
  );
}

/** Catalog details of one item (title, art, developer). */
export async function epicCatalogItem(
  namespace: string,
  catalogItemId: string,
  token: string,
): Promise<EpicCatalogItem | null> {
  const url = `${EPIC_CATALOG}/catalog/api/shared/namespace/${namespace}/bulk/items?id=${encodeURIComponent(catalogItemId)}&includeDLCDetails=true&includeMainGameDetails=true&country=US&locale=en`;
  const data = await epicGet<Record<string, EpicCatalogItem>>(url, token);
  return data[catalogItemId] ?? null;
}

/** One manifest entry of a build (its URL, hash and CDN query parameters). */
export interface EpicManifestEntry {
  uri?: string;
  hash?: string;
  queryParams?: Array<{ name?: string; value?: string }>;
}

/** One build of an app. */
export interface EpicBuild {
  appName?: string;
  buildVersion?: string;
  catalogItemId?: string;
  namespace?: string;
  manifests?: EpicManifestEntry[];
}

/** Resolve the build and manifest of one app. */
export async function epicBuild(
  namespace: string,
  catalogItemId: string,
  appName: string,
  token: string,
  platform = "Windows",
  label = "Live",
): Promise<EpicBuild | null> {
  const url =
    `${EPIC_LAUNCHER}/launcher/api/public/assets/v2/platform/${platform}` +
    `/namespace/${namespace}/catalogItem/${catalogItemId}/app/${appName}/label/${label}`;
  const data = await epicGet<{ elements?: EpicBuild[] }>(url, token);
  return data.elements?.[0] ?? null;
}

/** The full URL of a build's manifest, with its query parameters. */
export function epicManifestUrl(entry: EpicManifestEntry | undefined): string {
  const uri = entry?.uri ?? "";
  if (!uri) {
    die("the Epic build has no manifest");
  }
  const base = /^https?:\/\//.test(uri) ? uri : `${EPIC_CDN}/${uri.replace(/^\/+/, "")}`;
  const query = (entry?.queryParams ?? [])
    .filter((param) => param.name && param.value)
    .map((param) => `${encodeURIComponent(param.name!)}=${encodeURIComponent(param.value!)}`)
    .join("&");
  return query ? `${base}?${query}` : base;
}

/**
 * The CDN base URLs the chunks are served from.
 *
 * Epic returns them as the manifest's query parameters; a value that is not an
 * absolute URL is a path under the default CDN host.
 */
export function epicCdnBases(entry: EpicManifestEntry | undefined): string[] {
  const bases: string[] = [];
  for (const param of entry?.queryParams ?? []) {
    const value = param.value;
    if (!value) {
      continue;
    }
    if (/^https?:\/\//.test(value)) {
      bases.push(value.replace(/\/+$/, ""));
    } else {
      bases.push(`${EPIC_CDN}/${value.replace(/^\/+|\/+$/g, "")}`);
    }
  }
  return bases.length > 0 ? bases : [EPIC_CDN];
}

/** The URL of one chunk on a CDN base. */
export function epicChunkUrl(base: string, chunkPath: string): string {
  return `${base.replace(/\/+$/, "")}/${chunkPath.replace(/^\/+/, "")}`;
}

// --- BuildPatch manifest ------------------------------------------------------

/** One chunk in the manifest's chunk data list. */
export interface EpicChunk {
  guid: [number, number, number, number];
  hash: bigint;
  shaHash: Buffer;
  groupNum: number;
  windowSize: number;
  fileSize: bigint;
  secretGuid?: [number, number, number, number];
}

/** One part of a file, a window into a chunk. */
export interface EpicChunkPart {
  guid: [number, number, number, number];
  offset: number;
  size: number;
  fileOffset: number;
}

/** One file of the build. */
export interface EpicFileManifest {
  filename: string;
  symlinkTarget: string;
  hash: Buffer;
  flags: number;
  installTags: string[];
  chunkParts: EpicChunkPart[];
  fileSize: number;
  mimeType: string;
}

/** The manifest metadata (app, build and launch command). */
export interface EpicManifestMeta {
  dataVersion: number;
  featureLevel: number;
  appName: string;
  buildVersion: string;
  launchExe: string;
  launchCommand: string;
  buildId: string;
}

/** A parsed BuildPatch manifest. */
export interface EpicManifest {
  version: number;
  compressed: boolean;
  meta: EpicManifestMeta;
  chunks: EpicChunk[];
  files: EpicFileManifest[];
}

class Reader {
  private readonly buf: Buffer;
  private offset = 0;

  constructor(buf: Buffer) {
    this.buf = buf;
  }

  get pos(): number {
    return this.offset;
  }

  seek(to: number): void {
    this.offset = to;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }

  u8(): number {
    const value = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u32(): number {
    const value = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  i32(): number {
    const value = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  u64(): bigint {
    const value = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  i64(): bigint {
    const value = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  bytes(length: number): Buffer {
    const value = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  /** An Epic length-prefixed string; a negative length means UTF-16. */
  fstring(): string {
    const length = this.i32();
    if (length < 0) {
      const bytes = -length * 2;
      const value = this.buf.subarray(this.offset, this.offset + bytes - 2).toString("utf16le");
      this.offset += bytes;
      return value;
    }
    if (length > 0) {
      const value = this.buf.subarray(this.offset, this.offset + length - 1).toString("ascii");
      this.offset += length;
      return value;
    }
    return "";
  }
}

/** `ChunksV2`…`ChunksV5`, the CDN folder a chunk lives under. */
export function epicChunkDir(version: number): string {
  if (version >= 22) {
    return "ChunksV5";
  }
  if (version >= 15) {
    return "ChunksV4";
  }
  if (version >= 6) {
    return "ChunksV3";
  }
  if (version >= 3) {
    return "ChunksV2";
  }
  return "Chunks";
}

function guidHexUpper(guid: readonly number[]): string {
  return guid.map((part) => (part >>> 0).toString(16).toUpperCase().padStart(8, "0")).join("");
}

function packGuidLE(guid: readonly number[]): Buffer {
  const buf = Buffer.alloc(16);
  for (let i = 0; i < 4; i += 1) {
    buf.writeUInt32LE(guid[i]! >>> 0, i * 4);
  }
  return buf;
}

/** A GUID as a stable map key. */
export function epicGuidKey(guid: readonly number[]): string {
  return guidHexUpper(guid);
}

/** The CDN path of one chunk. */
export function epicChunkPath(chunk: EpicChunk, version: number): string {
  const dir = epicChunkDir(version);
  const group = String(chunk.groupNum).padStart(2, "0");
  if (version >= 22) {
    const secret = chunk.secretGuid && chunk.secretGuid.some((part) => part !== 0)
      ? packGuidLE(chunk.secretGuid).toString("base64url")
      : "plain";
    const hash = Buffer.alloc(8);
    hash.writeBigUInt64LE(BigInt(chunk.hash));
    const hashB64 = hash.toString("base64url");
    const guidB64 = packGuidLE(chunk.guid).toString("base64url");
    return `${dir}/${secret}/${group}/${hashB64}_${guidB64}.chunk`;
  }
  const hashHex = chunk.hash.toString(16).toUpperCase().padStart(16, "0");
  return `${dir}/${group}/${hashHex}_${guidHexUpper(chunk.guid)}.chunk`;
}

function readMeta(reader: Reader): EpicManifestMeta {
  const start = reader.pos;
  const metaSize = reader.u32();
  const dataVersion = reader.u8();
  const featureLevel = reader.u32();
  reader.u8(); // is_file_data
  reader.u32(); // app_id
  const appName = reader.fstring();
  const buildVersion = reader.fstring();
  const launchExe = reader.fstring();
  const launchCommand = reader.fstring();
  const prereqCount = reader.u32();
  for (let i = 0; i < prereqCount; i += 1) {
    reader.fstring();
  }
  reader.fstring(); // prereq_name
  reader.fstring(); // prereq_path
  reader.fstring(); // prereq_args
  const buildId = dataVersion >= 1 ? reader.fstring() : "";
  if (dataVersion >= 2) {
    reader.fstring(); // uninstall_action_path
    reader.fstring(); // uninstall_action_args
  }
  reader.seek(start + metaSize);
  return { dataVersion, featureLevel, appName, buildVersion, launchExe, launchCommand, buildId };
}

function readChunks(reader: Reader, featureLevel: number): EpicChunk[] {
  const start = reader.pos;
  const size = reader.u32();
  reader.u8(); // cdl version
  const count = reader.u32();
  const guids = Array.from(
    { length: count },
    () => [reader.u32(), reader.u32(), reader.u32(), reader.u32()] as EpicChunk["guid"],
  );
  const hashes = Array.from({ length: count }, () => reader.u64());
  const shaHashes = Array.from({ length: count }, () => reader.bytes(20));
  const groups = Array.from({ length: count }, () => reader.u8());
  const windowSizes = Array.from({ length: count }, () => reader.u32());
  const fileSizes = Array.from({ length: count }, () => reader.i64());
  const secretGuids =
    featureLevel >= 22
      ? Array.from(
          { length: count },
          () => [reader.u32(), reader.u32(), reader.u32(), reader.u32()] as EpicChunk["guid"],
        )
      : undefined;
  if (featureLevel >= 22) {
    reader.skip(count * 4); // window_size_compressed
    reader.skip(count * 16); // encryption_tag
  }
  reader.seek(start + size);

  return guids.map((guid, index) => ({
    guid,
    hash: hashes[index]!,
    shaHash: shaHashes[index]!,
    groupNum: groups[index]!,
    windowSize: windowSizes[index]!,
    fileSize: fileSizes[index]!,
    secretGuid: secretGuids?.[index],
  }));
}

function readFiles(reader: Reader): EpicFileManifest[] {
  const start = reader.pos;
  const size = reader.u32();
  const version = reader.u8();
  const count = reader.u32();
  const filenames = Array.from({ length: count }, () => reader.fstring());
  const symlinkTargets = Array.from({ length: count }, () => reader.fstring());
  const hashes = Array.from({ length: count }, () => reader.bytes(20));
  const flags = Array.from({ length: count }, () => reader.u8());
  const installTags = Array.from({ length: count }, () => {
    const tagCount = reader.u32();
    return Array.from({ length: tagCount }, () => reader.fstring());
  });
  const chunkParts = Array.from({ length: count }, () => {
    const partCount = reader.u32();
    const parts: EpicChunkPart[] = [];
    let fileOffset = 0;
    for (let i = 0; i < partCount; i += 1) {
      const partSize = reader.u32();
      const guid = [reader.u32(), reader.u32(), reader.u32(), reader.u32()] as EpicChunkPart["guid"];
      const offset = reader.u32();
      const partLength = reader.u32();
      parts.push({ guid, offset, size: partLength, fileOffset });
      fileOffset += partLength;
      if (partSize > 28) {
        reader.skip(partSize - 28);
      }
    }
    return parts;
  });
  const mimeTypes = version >= 1
    ? (() => {
        for (let i = 0; i < count; i += 1) {
          if (reader.u32() !== 0) {
            reader.skip(16); // md5
          }
        }
        return Array.from({ length: count }, () => reader.fstring());
      })()
    : undefined;
  if (version >= 2) {
    reader.skip(count * 32); // sha256
  }
  reader.seek(start + size);

  return filenames.map((filename, index) => ({
    filename,
    symlinkTarget: symlinkTargets[index]!,
    hash: hashes[index]!,
    flags: flags[index]!,
    installTags: installTags[index]!,
    chunkParts: chunkParts[index]!,
    fileSize: chunkParts[index]!.reduce((total, part) => total + part.size, 0),
    mimeType: mimeTypes?.[index] ?? "",
  }));
}

/**
 * Parse a binary Epic BuildPatch manifest.
 *
 * The header is `magic (u32) · header size · uncompressed size · compressed
 * size · sha1 (20) · stored_as (u8) · version (u32)`, followed by an optionally
 * zlib-compressed body of metadata, chunk list and file list. Encrypted
 * manifests (the `0x2` bit) are rejected: they are rare and need the per-build
 * secret from the launcher API.
 */
export function parseEpicManifest(data: Buffer): EpicManifest {
  const reader = new Reader(data);
  if (reader.u32() !== 0x44bec00c) {
    die("not an Epic BuildPatch manifest (bad magic)");
  }
  const headerSize = reader.u32();
  reader.u32(); // uncompressed size
  reader.u32(); // compressed size
  const sha = reader.bytes(20);
  const storedAs = reader.u8();
  const version = reader.u32();
  if (version >= 22) {
    reader.skip(16 + 16); // secret guid + encryption tag
  }
  if (reader.pos !== headerSize) {
    reader.seek(headerSize);
  }

  const compressed = (storedAs & 0x1) !== 0;
  if ((storedAs & 0x2) !== 0) {
    die("this Epic manifest is encrypted and is not supported yet");
  }
  let body = data.subarray(headerSize);
  if (compressed) {
    body = inflateSync(body);
    if (createHash("sha1").update(body).digest("hex") !== sha.toString("hex")) {
      die("Epic manifest hash mismatch");
    }
  }

  const bodyReader = new Reader(body);
  const meta = readMeta(bodyReader);
  const chunks = readChunks(bodyReader, meta.featureLevel);
  const files = readFiles(bodyReader);

  return { version, compressed, meta, chunks, files };
}

/** The file the manifest marks as the launch executable, if any. */
export function epicPrimaryExecutable(manifest: EpicManifest): string | null {
  const launch = manifest.meta.launchExe.replaceAll("\\", "/").trim();
  if (launch) {
    const match = manifest.files.find((file) => file.filename.replaceAll("\\", "/") === launch);
    if (match) {
      return launch;
    }
  }
  const executable = manifest.files.find((file) => (file.flags & 0x4) !== 0);
  return executable?.filename.replaceAll("\\", "/") ?? null;
}

// --- launch -------------------------------------------------------------------

/** An exchange code the game uses to authenticate with the Epic launcher. */
export async function epicGameToken(token: string): Promise<string> {
  const data = await epicGet<{ code?: string }>(`${EPIC_ACCOUNT}/account/api/oauth/exchange`, token);
  return data.code ?? "";
}

/** What a launch needs to authenticate with Epic. */
export interface EpicLaunchContext {
  appName: string;
  namespace: string;
  accountId: string;
  displayName: string;
  /** Exchange code from `epicGameToken`; empty for an offline launch. */
  exchangeCode: string;
  language?: string;
  deploymentId?: string;
}

/**
 * The Epic launcher arguments a game receives on startup.
 *
 * Mirrors legendary's `get_launch_parameters`: the game authenticates with the
 * exchange code in `AUTH_PASSWORD`, and the remaining flags identify the app,
 * the user and the sandbox. An empty exchange code is an offline launch.
 */
export function epicLaunchParameters(context: EpicLaunchContext): string[] {
  const parameters = [
    "-AUTH_LOGIN=unused",
    `-AUTH_PASSWORD=${context.exchangeCode}`,
    "-AUTH_TYPE=exchangecode",
    `-epicapp=${context.appName}`,
    "-epicenv=Prod",
    "-EpicPortal",
    `-epicusername=${context.displayName}`,
    `-epicuserid=${context.accountId}`,
    `-epiclocale=${context.language ?? "en"}`,
    `-epicsandboxid=${context.namespace}`,
  ];
  if (context.deploymentId) {
    parameters.push(`-epicdeploymentid=${context.deploymentId}`);
  }
  return parameters;
}

// --- download -----------------------------------------------------------------

export interface EpicDownloadOptions {
  token: string;
  platform?: string;
  label?: string;
  onProgress?: (message: string) => void;
}

/**
 * Download an Epic build into `dest` and return the folder.
 *
 * Resolves the build, parses its BuildPatch manifest, downloads every needed
 * chunk (verifying the SHA-1), then writes each file by slicing its chunk
 * parts. Chunks are zlib-compressed on the CDN.
 */
export async function downloadEpicBuild(
  slug: string,
  namespace: string,
  catalogItemId: string,
  appName: string,
  options: EpicDownloadOptions,
): Promise<string> {
  const { token, platform = "Windows", label = "Live", onProgress = () => {} } = options;
  const dest = epicDownloadsDir(slug);

  const build = await epicBuild(namespace, catalogItemId, appName, token, platform, label);
  const entry = build?.manifests?.[0];
  onProgress(`build ${build?.buildVersion ?? "?"} (${appName})`);

  const manifestBytes = await epicBuffer(epicManifestUrl(entry), token);
  const manifest = parseEpicManifest(manifestBytes);
  const bases = epicCdnBases(entry);

  const byGuid = new Map(manifest.chunks.map((chunk) => [epicGuidKey(chunk.guid), chunk]));
  const needed = new Map<string, EpicChunk>();
  for (const file of manifest.files) {
    for (const part of file.chunkParts) {
      const key = epicGuidKey(part.guid);
      const chunk = byGuid.get(key);
      if (chunk) {
        needed.set(key, chunk);
      }
    }
  }

  const cache = new Map<string, Buffer>();
  let index = 0;
  for (const [key, chunk] of needed) {
    if (isDryRun()) {
      onProgress(`dry-run: would download chunk ${index + 1}/${needed.size}`);
      index += 1;
      continue;
    }
    const url = epicChunkUrl(bases[index % bases.length]!, epicChunkPath(chunk, manifest.version));
    const compressed = await epicBuffer(url, token);
    const data = inflateSync(compressed);
    if (createHash("sha1").update(data).digest("hex") !== chunk.shaHash.toString("hex")) {
      die(`chunk checksum mismatch for ${key}`);
    }
    cache.set(key, data);
    index += 1;
    if (index % 200 === 0) {
      onProgress(`  ${index}/${needed.size} chunks`);
    }
  }

  for (const file of manifest.files) {
    const target = join(dest, file.filename.replaceAll("\\", "/"));
    await mkdirp(dirname(target));
    if (isDryRun()) {
      continue;
    }
    const parts = file.chunkParts.map((part) => {
      const data = cache.get(epicGuidKey(part.guid));
      if (!data) {
        die(`missing chunk for ${file.filename}`);
      }
      return data.subarray(part.offset, part.offset + part.size);
    });
    await writeBytes(target, Buffer.concat(parts));
  }

  const exe = epicPrimaryExecutable(manifest);
  log(`epic: downloaded ${manifest.meta.appName} → ${dest}${exe ? ` (exe ${exe})` : ""}`);
  return dest;
}

/** Where an Epic game's download lives. */
export function epicDownloadDir(slug: string): string {
  return epicDownloadsDir(slug);
}

/** Key images from a catalog item, best (iconic) first. */
export function epicIconCandidates(item: EpicCatalogItem | null): string[] {
  const order = ["DieselGameBox", "DieselGameBoxTall", "OfferImageTall", "OfferImageWide", "Thumbnail", "DieselStoreFrontTall"];
  const images = item?.keyImages ?? [];
  const urls: string[] = [];
  for (const type of order) {
    const match = images.find((image) => image.type === type && typeof image.url === "string");
    if (match?.url) {
      urls.push(match.url);
    }
  }
  for (const image of images) {
    if (typeof image.url === "string" && !urls.includes(image.url)) {
      urls.push(image.url);
    }
  }
  return urls;
}
