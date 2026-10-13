// GOG.com support: OAuth, the owned library, and the Galaxy content-system.
//
// GOG is DRM-free: once the Windows build is on disk the game runs under Wine
// with no launcher. The protocol follows the reference implementation `gogdl`
// (Heroic Games Launcher): builds → zlib meta → depot manifest → chunks, each
// chunk a zlib blob addressed by its compressed md5.
//
// docs: docs/plans/gog-support.md, docs/plans/gog-implementation.md

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { exec, isDryRun } from "./exec.ts";
import { mkdirp, readJson, remove, writeBytes, writeJson } from "./fsx.ts";
import { die, log } from "./log.ts";
import { gogAuthPath, gogDownloadsDir } from "./paths.ts";
import type { GogCredentials } from "./config.ts";

export const GOG_AUTH = "https://auth.gog.com";
export const GOG_API = "https://api.gog.com";
export const GOG_EMBED = "https://embed.gog.com";
export const GOG_CONTENT_SYSTEM = "https://content-system.gog.com";
export const GOG_CDN = "https://gog-cdn-fastly.gog.com";
const REDIRECT_URI = "https://embed.gog.com/on_login_success?origin=client";

/** A stored OAuth session. */
export interface GogTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  /** Unix seconds when the token was issued. */
  loginTime: number;
}

// --- auth ---------------------------------------------------------------------

/** The URL the user opens to log in; GOG redirects back with a `code`. */
export function gogLoginUrl(credentials: GogCredentials, redirectUri: string = REDIRECT_URI): string {
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    layout: "client2",
  });
  return `${GOG_AUTH}/auth?${params.toString()}`;
}

function tokenUrl(credentials: GogCredentials, extra: Record<string, string>): string {
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    ...extra,
  });
  return `${GOG_AUTH}/token?${params.toString()}`;
}

/**
 * Pull the `code` out of a pasted redirect URL, or return the input unchanged.
 *
 * GOG rejects a `http://localhost` redirect at the token step
 * (`redirect_uri_mismatch`), so the browser always lands on
 * `https://embed.gog.com/on_login_success?origin=client&code=…`. Accepting the
 * whole URL is far easier than finding the code by hand.
 */
export function extractGogCode(input: string): string {
  const value = input.trim();
  const match = /[?&]code=([^&\s]+)/.exec(value);
  return match ? decodeURIComponent(match[1]!) : value;
}

/** Exchange the login `code` for tokens and store them. */
export async function gogExchangeCode(
  credentials: GogCredentials,
  code: string,
  redirectUri: string = REDIRECT_URI,
): Promise<GogTokens> {
  const response = await fetch(
    tokenUrl(credentials, { grant_type: "authorization_code", redirect_uri: redirectUri, code }),
  );
  if (!response.ok) {
    const body = await response.text();
    die(`GOG login failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as Omit<GogTokens, "loginTime">;
  const tokens: GogTokens = { ...data, loginTime: Date.now() / 1000 };
  await writeJson(gogAuthPath(), tokens);
  return tokens;
}

/** Refresh an expired session. Returns `null` when the refresh token is dead. */
export async function gogRefresh(credentials: GogCredentials, refreshToken: string): Promise<GogTokens | null> {
  const response = await fetch(tokenUrl(credentials, { grant_type: "refresh_token", refresh_token: refreshToken }));
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as Omit<GogTokens, "loginTime">;
  const tokens: GogTokens = { ...data, loginTime: Date.now() / 1000 };
  await writeJson(gogAuthPath(), tokens);
  return tokens;
}

/** Stored tokens, or `null`. */
export async function loadGogTokens(): Promise<GogTokens | null> {
  return readJson<GogTokens>(gogAuthPath());
}

/** A valid access token, refreshing when needed. Dies when not logged in. */
export async function ensureGogToken(credentials: GogCredentials): Promise<string> {
  let tokens = await loadGogTokens();
  if (!tokens) {
    die("not logged in to GOG — run: decanter login gog");
  }
  if (Date.now() / 1000 >= tokens.loginTime + tokens.expires_in) {
    const refreshed = await gogRefresh(credentials, tokens.refresh_token);
    if (!refreshed) {
      die("GOG session expired — run: decanter login gog");
    }
    tokens = refreshed;
  }
  return tokens.access_token;
}

// --- API ----------------------------------------------------------------------

async function gogGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "decanter" },
  });
  if (!response.ok) {
    die(`GOG request failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

/** Fetch a GOG URL as bytes, with the bearer token. */
export async function gogBuffer(url: string, token: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "decanter" },
  });
  if (!response.ok) {
    die(`GOG download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Ids of the games on the account. */
export async function gogOwnedGames(token: string): Promise<number[]> {
  const data = await gogGet<{ owned: number[] }>(`${GOG_EMBED}/user/data/games`, token);
  return data.owned ?? [];
}

export interface GogInstallerFile {
  id: string;
  size: number;
  downlink: string;
}

export interface GogInstaller {
  id: string;
  os: string;
  language: string;
  version?: string | null;
  total_size: number;
  files: GogInstallerFile[];
}

export interface GogProduct {
  id: number;
  title: string;
  slug?: string;
  images?: Record<string, string>;
  downloads?: { installers?: GogInstaller[] };
}

/** Product details including the offline installers. */
export async function gogProduct(id: number, token: string): Promise<GogProduct> {
  return gogGet<GogProduct>(`${GOG_API}/products/${id}?expand=downloads`, token);
}

/** The Windows offline installers of a product. */
export function windowsInstallers(product: GogProduct): GogInstaller[] {
  return (product.downloads?.installers ?? []).filter((installer) => installer.os === "windows");
}

/**
 * GOG artwork candidates for an app icon, best first.
 *
 * The product `images` map addresses its files with protocol-relative URLs
 * (`//images-…gog-statics.com/…`), which `fetch` rejects, so every URL is made
 * absolute. The square `icon` makes the best `.icns`; the transparent logo and
 * the wide background are the fallbacks.
 */
export function gogIconCandidates(images: Record<string, string> | undefined): string[] {
  const order = ["icon", "logo2x", "logo", "background"];
  return order
    .map((key) => images?.[key])
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((url) => (url.startsWith("//") ? `https:${url}` : url));
}

/** One build from the content system. */
export interface GogBuild {
  build_id: string;
  version_name: string;
  /** zlib-encoded build meta. */
  link: string;
  branch?: string | null;
}

/** Windows builds of a product, newest first. */
export async function gogBuilds(id: number, token: string, os = "windows"): Promise<GogBuild[]> {
  const data = await gogGet<{ items: GogBuild[] }>(
    `${GOG_CONTENT_SYSTEM}/products/${id}/os/${os}/builds?generation=2`,
    token,
  );
  return data.items ?? [];
}

export interface GogBuildMeta {
  baseProductId: string;
  installDirectory: string;
  buildId?: string;
  dependencies?: string[];
  depots: Array<{
    productId: string;
    languages: string[];
    compressedSize?: number;
    size?: number;
    manifest: string;
  }>;
}

export interface GogChunk {
  /** md5 of the compressed (zlib) blob — what the CDN is addressed by. */
  compressedMd5: string;
  compressedSize: number;
  /** md5 of the decompressed content. */
  md5: string;
  size: number;
}

export interface GogDepotFile {
  type: "DepotFile";
  path: string;
  chunks: GogChunk[];
  md5?: string;
  sha256?: string;
  flags?: string[];
}

export interface GogDepotDirectory {
  type: "DepotDirectory";
  path: string;
}

export interface GogDepotLink {
  type: "DepotLink";
  path: string;
  target: string;
}

export type GogDepotItem = GogDepotFile | GogDepotDirectory | GogDepotLink;

export interface GogDepotManifest {
  depot: { items: GogDepotItem[] };
}

/** `abcdef…` → `ab/cd/abcdef…` (the CDN sharding GOG uses). */
export function galaxyPath(hash: string): string {
  if (hash.includes("/")) {
    return hash;
  }
  return `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

/** Decode a GOG zlib payload, falling back to plain JSON. */
export function decodeZlib<T>(buffer: Buffer): T {
  try {
    return JSON.parse(inflateSync(buffer).toString("utf8")) as T;
  } catch {
    return JSON.parse(buffer.toString("utf8")) as T;
  }
}

/** The build meta (zlib) behind a build's `link`. */
export async function gogBuildMeta(link: string, token: string): Promise<GogBuildMeta> {
  return decodeZlib<GogBuildMeta>(await gogBuffer(link, token));
}

/** One depot manifest (zlib) from the CDN. */
export async function gogDepotManifest(manifest: string, token: string): Promise<GogDepotManifest> {
  const url = `${GOG_CDN}/content-system/v2/meta/${galaxyPath(manifest)}`;
  return decodeZlib<GogDepotManifest>(await gogBuffer(url, token));
}

export interface GogSecureEndpoint {
  url_format: string;
  parameters: Record<string, string>;
}

/** Signed CDN endpoints for a product path. */
export async function gogSecureLink(
  id: number,
  token: string,
  path = "/",
  generation = 2,
): Promise<GogSecureEndpoint[]> {
  const url = `${GOG_CONTENT_SYSTEM}/products/${id}/secure_link?_version=2&generation=${generation}&path=${encodeURIComponent(path)}`;
  const data = await gogGet<{ urls: GogSecureEndpoint[] }>(url, token);
  return data.urls ?? [];
}

/** Fill `{param}` placeholders from an endpoint's parameters. */
export function fillUrl(endpoint: GogSecureEndpoint): string {
  let url = endpoint.url_format;
  for (const [key, value] of Object.entries(endpoint.parameters)) {
    url = url.replaceAll(`{${key}}`, value);
  }
  return url;
}

/** The CDN URL of one compressed chunk. */
export function chunkUrl(endpoints: GogSecureEndpoint[], compressedMd5: string, index = 0): string {
  if (endpoints.length === 0) {
    die("GOG returned no secure-link endpoints");
  }
  const endpoint = endpoints[Math.min(index, endpoints.length - 1)]!;
  const parameters = {
    ...endpoint.parameters,
    path: `${endpoint.parameters["path"] ?? ""}/${galaxyPath(compressedMd5)}`,
  };
  return fillUrl({ url_format: endpoint.url_format, parameters });
}

/** Depots that belong to the base product and match the language. */
export function baseDepots(meta: GogBuildMeta, language: string): GogBuildMeta["depots"] {
  const base = meta.depots.filter((depot) => depot.productId === meta.baseProductId);
  const matching = base.filter((depot) => depot.languages.includes("*") || depot.languages.includes(language));
  return matching.length > 0 ? matching : base;
}

// --- download -----------------------------------------------------------------

export interface GogDownloadOptions {
  token: string;
  language?: string;
  onProgress?: (message: string) => void;
}

/**
 * Download the newest Windows build of a GOG product into `dest`.
 *
 * Returns the absolute path of the game folder (`dest` + the build's
 * `installDirectory`). Patches, DLC and redistributables are out of scope.
 */
export async function downloadGogBuild(id: number, dest: string, options: GogDownloadOptions): Promise<string> {
  const { token, language = "en-US", onProgress = () => {} } = options;
  const builds = await gogBuilds(id, token);
  if (builds.length === 0) {
    die(`no Windows build for GOG product ${id}`);
  }
  const build = builds[0]!;
  onProgress(`build ${build.version_name} (${build.build_id})`);

  const meta = await gogBuildMeta(build.link, token);
  const productId = Number(meta.baseProductId);
  const root = join(dest, meta.installDirectory);
  const endpoints = await gogSecureLink(productId, token, "/");

  const depots = baseDepots(meta, language);
  for (const depot of depots) {
    const manifest = await gogDepotManifest(depot.manifest, token);
    for (const item of manifest.depot.items) {
      const rel = item.path.replaceAll("\\", "/").replace(/^\/+/, "");
      if (item.type === "DepotDirectory") {
        await mkdirp(join(root, rel));
        continue;
      }
      if (item.type === "DepotLink") {
        // Symlinks are rare on Windows builds; create them when they appear.
        const target = join(root, rel);
        await mkdirp(dirname(target));
        await remove(target);
        if (!isDryRun()) {
          await exec("ln", ["-sfn", item.target.replaceAll("\\", "/"), target], { allowFailure: true });
        }
        continue;
      }

      const target = join(root, rel);
      await mkdirp(dirname(target));
      const parts: Buffer[] = [];
      for (const chunk of item.chunks) {
        const compressed = await gogBuffer(chunkUrl(endpoints, chunk.compressedMd5), token);
        const sum = createHash("md5").update(compressed).digest("hex");
        if (sum !== chunk.compressedMd5) {
          die(`chunk checksum mismatch for ${rel} (${chunk.compressedMd5})`);
        }
        parts.push(inflateSync(compressed));
      }
      await writeBytes(target, Buffer.concat(parts));
      onProgress(`  ${rel}`);
    }
  }

  log(`gog: downloaded ${meta.installDirectory} → ${root}`);
  return root;
}

// --- search -------------------------------------------------------------------

export interface GogSearchHit {
  id: number;
  title: string;
  slug: string;
}

/** Public GOG catalog search (no login needed). */
export async function gogSearch(term: string, fetchImpl: typeof fetch = fetch): Promise<GogSearchHit[]> {
  const url = `https://www.gog.com/games/ajax/filtered?mediaType=game&language=en&search=${encodeURIComponent(term)}`;
  const response = await fetchImpl(url, { headers: { "User-Agent": "decanter" } });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { products?: Array<{ id: number; title: string; slug: string }> };
  return (data.products ?? []).map((product) => ({
    id: product.id,
    title: product.title,
    slug: product.slug,
  }));
}

/** Every product in the account's library, with its title. */
export async function gogLibrary(token: string): Promise<GogSearchHit[]> {
  const out: GogSearchHit[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = `${GOG_EMBED}/account/getFilteredProducts?mediaType=1&sortBy=title&page=${page}`;
    const data = await gogGet<{
      products?: Array<{ id: number; title: string; url?: string }>;
      totalPages?: number;
    }>(url, token);
    const products = data.products ?? [];
    out.push(
      ...products.map((product) => ({
        id: product.id,
        title: product.title,
        slug: product.url?.split("/").pop() ?? "",
      })),
    );
    if (products.length === 0 || (data.totalPages !== undefined && page >= data.totalPages)) {
      break;
    }
  }
  return out;
}

/**
 * Search the user's own GOG library.
 *
 * The store search misses delisted games that are still owned (e.g. The
 * Settlers 2), so `add --store gog` looks here first.
 */
export async function gogLibrarySearch(term: string, token: string): Promise<GogSearchHit[]> {
  const url = `${GOG_EMBED}/account/getFilteredProducts?mediaType=1&sortBy=title&search=${encodeURIComponent(term)}&page=1`;
  const data = await gogGet<{ products?: Array<{ id: number; title: string; url?: string }> }>(url, token);
  return (data.products ?? []).map((product) => ({
    id: product.id,
    title: product.title,
    slug: product.url?.split("/").pop() ?? "",
  }));
}

/** Where a game's GOG download lives. */
export function gogDownloadDir(slug: string): string {
  return gogDownloadsDir(slug);
}

/**
 * The primary executable a GOG build declares in `goggame-<id>.info`.
 *
 * GOG writes a `playTasks` list with the real entry point (e.g. `bin/S2DNG.exe`
 * for The Settlers 2), which beats guessing by size.
 */
export async function gogPrimaryExecutable(gameDir: string, gogId: number): Promise<string | null> {
  const info = await readJson<{
    playTasks?: Array<{ isPrimary?: boolean; category?: string; path?: string }>;
  }>(join(gameDir, `goggame-${gogId}.info`));
  const task =
    info?.playTasks?.find((entry) => entry.isPrimary) ?? info?.playTasks?.find((entry) => entry.category === "game");
  return task?.path ?? null;
}
