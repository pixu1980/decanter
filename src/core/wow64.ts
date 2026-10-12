// The Rosetta 2 `wow64cpu.dll` fix for Wine's new WoW64.
//
// Wine's new WoW64 runs 32-bit code inside a 64-bit process and switches the
// CPU between 32-bit and 64-bit mode on every system call. Upstream Wine uses
// far *jumps* for that switch; Rosetta 2 on Apple Silicon sometimes does not
// change modes on a far jump, so the 64-bit thunk runs as 32-bit code and
// faults:
//
//   wine: Unhandled page fault on read access to 00002EC5 at address 7BF21135
//   (thread 015c), starting debugger...
//
// The fault lands in `wow64cpu.dll` (or the 32-bit `ntdll.dll` thunk beside
// it) and kills the game: the menu may load, then a mission or the next D3D
// call dies. A community patch rebuilds `wow64cpu.dll` with far *returns*,
// which Rosetta handles, and publishes a prebuilt per Wine version.
//
// Wine loads `wow64cpu.dll` from the prefix (`C:\windows\system32`), and
// `wineboot` copies it there from the runtime, so both copies are replaced.
// GPTK carries Wine 7.7's old WoW64 and never hits this bug, so the fix only
// touches the Gcenx `wine-devel` / `wine-staging` runtimes.
//
// docs: docs/troubleshooting.md

import { createHash } from "node:crypto";
import { join } from "node:path";
import { exec, isDryRun } from "./exec.ts";
import { exists, writeBytes } from "./fsx.ts";
import { die, log, warn } from "./log.ts";
import { wineDir } from "./paths.ts";
import type { WineRuntime } from "./wine.ts";

/** A prebuilt patched `wow64cpu.dll`, pinned by SHA-256. */
export interface Wow64Fix {
  /** Raw download URL of the patched DLL. */
  url: string;
  /** SHA-256 of the DLL, verified before it is used. */
  sha256: string;
}

/** Where the far-return patch comes from, for attribution. */
export const WOW64_FIX_SOURCE =
  "https://github.com/kic99/TEW_IX_on_Mac/tree/main/wow64cpu-rosetta-fix";

// Pinned to a commit, not `main`: a moving target would silently change what a
// checksum is meant to prove.
const FIX_BASE =
  "https://raw.githubusercontent.com/kic99/TEW_IX_on_Mac/e245c9ffc2156dca877274f0fe95daf44ec41261/wow64cpu-rosetta-fix/prebuilt";

/**
 * Wine versions with a prebuilt far-return `wow64cpu.dll`.
 *
 * Only versions with a pinned prebuilt are listed: the DLL is a PE image built
 * against one Wine source tree, so guessing across versions is not safe. Build
 * the DLL for another version with the upstream `build.sh` and add its digest.
 */
export const ROSETTA_WOW64_FIX: Record<string, Wow64Fix> = {
  "11.18": {
    url: `${FIX_BASE}/wine-11.18/wow64cpu.dll`,
    sha256: "e66383d66b232f6434bdc0cef9574420dbce2a52b1b6c6a7bd40260c951bf106",
  },
};

/** The prebuilt fix for a Wine version, or `undefined`. */
export function rosettaWow64Fix(version: string): Wow64Fix | undefined {
  return ROSETTA_WOW64_FIX[version];
}

/** Does this runtime run 32-bit games through Wine's new WoW64? */
export function usesNewWow64(runtime: WineRuntime): boolean {
  return runtime.name === "wine-devel" || runtime.name === "wine-staging";
}

/** Options accepted by {@link installRosettaWow64Fix}. */
export interface Wow64FixOptions {
  /** Override the host architecture (tests). */
  arch?: string;
  /** Override the download (tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Install the Rosetta `wow64cpu.dll` fix into a runtime and its prefix.
 *
 * A no-op on Intel Macs and on runtimes that do not use Wine's new WoW64. Warns
 * when the runtime's version has no pinned prebuilt, so setup still completes
 * (the game may simply crash in `wow64cpu.dll`).
 */
export async function installRosettaWow64Fix(
  runtime: WineRuntime,
  prefix: string,
  options: Wow64FixOptions = {},
): Promise<boolean> {
  const arch = options.arch ?? process.arch;
  if (arch !== "arm64" || !usesNewWow64(runtime)) {
    return false;
  }
  const fix = rosettaWow64Fix(runtime.version);
  if (!fix) {
    warn(
      `${runtime.label}: no Rosetta wow64cpu fix for this version: 32-bit games may crash in wow64cpu.dll`,
    );
    return false;
  }
  return applyWow64Fix(fix, runtime, prefix, options);
}

/** Download (once), verify and copy a prebuilt fix into the runtime and prefix. */
export async function applyWow64Fix(
  fix: Wow64Fix,
  runtime: WineRuntime,
  prefix: string,
  options: Wow64FixOptions = {},
): Promise<boolean> {
  const cached = await ensureWow64Fix(fix, options.fetchImpl);
  const targets = [
    join(runtime.distDir, "lib", "wine", "x86_64-windows", "wow64cpu.dll"),
    join(prefix, "drive_c", "windows", "system32", "wow64cpu.dll"),
  ];
  let installed = false;
  for (const target of targets) {
    if (!exists(target)) {
      continue;
    }
    await copyWow64Fix(cached, target);
    installed = true;
  }
  if (installed) {
    log(`${runtime.label}: applied the Rosetta 2 wow64cpu fix`);
  }
  return installed;
}

/** The cached patched DLL, downloaded and verified once. */
async function ensureWow64Fix(fix: Wow64Fix, fetchImpl: typeof fetch = fetch): Promise<string> {
  const path = join(wineDir(), `wow64cpu-${fix.sha256.slice(0, 12)}.dll`);
  if (exists(path)) {
    return path;
  }
  if (isDryRun()) {
    log(`dry-run: would download the Rosetta wow64cpu fix → ${path}`);
    return path;
  }
  log("rosetta 2: downloading the wow64cpu fix");
  const response = await fetchImpl(fix.url);
  if (!response.ok) {
    die(`could not download the Rosetta wow64cpu fix (HTTP ${response.status})`);
  }
  const data = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(data).digest("hex");
  if (digest !== fix.sha256) {
    die(`the Rosetta wow64cpu fix failed its checksum (got ${digest}, want ${fix.sha256})`);
  }
  await writeBytes(path, data);
  return path;
}

/** Copy the patched DLL over `target`, keeping the original as `.orig`. */
async function copyWow64Fix(from: string, target: string): Promise<void> {
  if (!exists(`${target}.orig`)) {
    await exec("cp", ["-p", target, `${target}.orig`]);
  }
  await exec("cp", ["-f", from, target]);
}
