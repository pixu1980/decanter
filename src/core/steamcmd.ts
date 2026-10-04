// SteamCMD: a headless, scriptable way to download a Windows depot.
//
// `download_depot` needs the app on the account you log in with; anonymous
// works for free games and demos. When a download is not possible the CLI falls
// back to the guided Steam-console flow (`depot.ts`, `console.ts`).
//
// docs: docs/managing.md

import { join } from "node:path";
import type { SteamCmdAccount } from "./config.ts";
import { exists, mkdirp, readText, remove } from "./fsx.ts";
import { exec, isDryRun } from "./exec.ts";
import { log, warn } from "./log.ts";
import { steamcmdDir, steamcmdHome } from "./paths.ts";

const STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz";

/** Path of the SteamCMD launcher inside the local install. */
export function steamcmdPath(): string {
  return join(steamcmdDir(), "steamcmd.sh");
}

/** SteamCMD's isolated `~/Library/Application Support/Steam` root. */
function steamcmdSteamRoot(): string {
  return join(steamcmdHome(), "Library", "Application Support", "Steam");
}

/** SteamCMD runs with its own HOME so it never touches the native client. */
function steamcmdEnv(): Record<string, string> {
  return { HOME: steamcmdHome() };
}

/** Download and unpack SteamCMD on first use; return the launcher path. */
export async function ensureSteamcmd(): Promise<string> {
  const script = steamcmdPath();
  if (exists(script)) {
    return script;
  }

  log("steamcmd: downloading the official macOS build");
  const archive = join(steamcmdDir(), "steamcmd_osx.tar.gz");
  await mkdirp(steamcmdDir());
  await exec("curl", ["-fL", "--retry", "3", "-o", archive, STEAMCMD_URL]);
  if (isDryRun()) {
    return script;
  }
  await exec("tar", ["xzf", archive, "-C", steamcmdDir()]);
  await remove(archive);
  await exec("chmod", ["+x", script]);
  return script;
}

/** SteamCMD login arguments for the configured account. */
export function loginArgs(account: SteamCmdAccount): string[] {
  if (account.anonymous || !account.username) {
    return ["+login", "anonymous"];
  }
  if (account.password) {
    return ["+login", account.username, account.password];
  }

  return ["+login", account.username];
}

/** Does SteamCMD have a stored (non-anonymous) login? */
export function steamcmdHasLogin(): boolean {
  return exists(join(steamcmdSteamRoot(), "config", "loginusers.vdf"));
}

/**
 * Read the account name the native Steam client last used, so `steam-mac login`
 * can default to it instead of the anonymous login.
 */
export async function detectSteamAccount(steamRoot: string): Promise<string | null> {
  const text = await readText(join(steamRoot, "config", "loginusers.vdf"));
  return text?.match(/"AccountName"\s+"([^"]+)"/)?.[1] ?? null;
}

/** Open an interactive SteamCMD session so it can store a login. */
export async function steamcmdLogin(account: SteamCmdAccount): Promise<void> {
  const script = await ensureSteamcmd();
  await mkdirp(steamcmdHome());
  const who = account.anonymous || !account.username ? "anonymous" : account.username;
  const args = [...loginArgs(account), "+quit"];
  log(`steamcmd: logging in as ${who} (type the password and any Steam Guard code)`);
  const result = await exec(script, args, { stdio: "inherit", allowFailure: true, env: steamcmdEnv() });
  if (result.status !== 0) {
    warn("steamcmd login did not complete — run 'steam-mac login <username>' to retry");
    return;
  }
  if (!account.anonymous && steamcmdHasLogin()) {
    log("steamcmd: login stored — 'download' will use it");
  }
}

export interface DepotDownloadResult {
  /** Folder SteamCMD wrote the depot into. */
  depotDir?: string;
  /** Manifest id reported by SteamCMD, when present. */
  manifest?: string;
  /** SteamCMD's combined output. */
  output: string;
}

/** Parse SteamCMD output for the download path and manifest id. */
export function parseDepotDownload(output: string): DepotDownloadResult {
  const complete = /Depot download complete\s*:\s*"([^"]+)"(?:\s*\(\d+ files, manifest (\d+)\))?/.exec(output);
  if (complete) {
    // SteamCMD on macOS reports the path with Windows separators.
    return { depotDir: complete[1]!.replace(/\\/g, "/"), manifest: complete[2], output };
  }

  return { output };
}

/**
 * Download a Windows depot with SteamCMD.
 *
 * `@sSteamCmdForcePlatformType windows` is what makes a macOS SteamCMD fetch
 * the Windows build rather than the macOS one.
 */
export async function downloadDepot(options: {
  appid: number;
  depot: number;
  account: SteamCmdAccount;
}): Promise<DepotDownloadResult> {
  const script = await ensureSteamcmd();
  await mkdirp(steamcmdHome());
  const args = [
    "+@sSteamCmdForcePlatformType",
    "windows",
    ...loginArgs(options.account),
    "+download_depot",
    String(options.appid),
    String(options.depot),
    "+quit",
  ];

  const result = await exec(script, args, { allowFailure: true, env: steamcmdEnv() });
  const output = `${result.stdout}\n${result.stderr}`;

  const parsed = parseDepotDownload(output);
  if (parsed.depotDir) {
    return parsed;
  }

  const error = /ERROR!\s*(.+)/.exec(output);
  if (error) {
    throw new Error(`steamcmd: ${error[1]!.trim()}`);
  }
  if (result.status !== 0) {
    throw new Error(`steamcmd exited with ${result.status}\n${tail(output)}`);
  }

  return { output };
}

function tail(text: string, lines = 12): string {
  return text.split("\n").slice(-lines).join("\n").trim();
}
