// Process helpers.
//
// Every external command goes through here so that `--dry-run` is honoured in
// exactly one place and library code can stay free of `process.exit`.
//
// docs: docs/architecture.md

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { die, log } from "./log.ts";

let dryRun = false;

/** Thrown when the current action was cancelled (TUI escape). */
export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

let cancelled = false;
const running = new Set<ChildProcess>();

/**
 * Cancel the current action: kill its running children and make the next `exec`
 * throw. The TUI calls this on escape while an action is in flight.
 */
export function cancel(): void {
  cancelled = true;
  for (const child of running) {
    child.kill("SIGTERM");
  }
  const timer = setTimeout(() => {
    for (const child of running) {
      child.kill("SIGKILL");
    }
  }, 1500);
  timer.unref?.();
}

/** Clear the cancel flag before a new action. */
export function resetCancel(): void {
  cancelled = false;
}

/** Has the current action been cancelled? */
export function isCancelled(): boolean {
  return cancelled;
}

/** Turn dry-run mode on or off for the whole process. */
export function setDryRun(value: boolean): void {
  dryRun = value;
}

/** Is dry-run mode active? */
export function isDryRun(): boolean {
  return dryRun;
}

export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Feed this string to the command's stdin. */
  stdin?: string;
  /** `inherit` connects the child to the terminal instead of capturing. */
  stdio?: "capture" | "inherit";
  /** A non-zero exit is returned instead of thrown. */
  allowFailure?: boolean;
}

/** Run a command. Under dry-run this only prints what would run. */
export async function exec(cmd: string, args: string[] = [], options: ExecOptions = {}): Promise<ExecResult> {
  if (dryRun) {
    log(`dry-run: ${[cmd, ...args].join(" ")}`);
    return { status: 0, stdout: "", stderr: "" };
  }
  if (cancelled) {
    throw new CancelledError();
  }

  const stdio = options.stdio ?? "capture";
  const child = spawn(cmd, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: stdio === "inherit" ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  running.add(child);

  let stdout = "";
  let stderr = "";
  if (stdio === "capture") {
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
  }
  if (options.stdin !== undefined) {
    child.stdin?.end(options.stdin);
  }

  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (value) => resolve(value ?? 0));
  });
  running.delete(child);

  if (cancelled) {
    throw new CancelledError();
  }

  const result = { status: code, stdout, stderr };
  if (code !== 0 && !options.allowFailure) {
    die(`command failed (${code}): ${[cmd, ...args].join(" ")}${stderr ? `\n${stderr.trim()}` : ""}`);
  }

  return result;
}

/** Run a command with the terminal attached. A failure stops the program. */
export async function run(cmd: string, args: string[] = [], options: ExecOptions = {}): Promise<void> {
  const result = await exec(cmd, args, { ...options, stdio: "inherit" });
  if (result.status !== 0) {
    die(`command failed (${result.status}): ${[cmd, ...args].join(" ")}`);
  }
}

/** Run a shell snippet with zsh, exposing legacy helper functions. */
export async function runShell(script: string, options: ExecOptions = {}): Promise<ExecResult> {
  const prelude = [
    'sm_log()  { print -r -- "$*" }',
    'sm_warn() { print -ru2 -- "$*" }',
    'sm_die()  { print -ru2 -- "$*"; exit 1 }',
  ].join("\n");
  return exec("/bin/zsh", ["-c", `${prelude}\n${script}`], { ...options, allowFailure: true });
}

/** Resolve an executable on `PATH`, or `null`. */
export function which(bin: string): string | null {
  if (bin.includes("/")) {
    return existsSync(bin) ? bin : null;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = join(dir, bin);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
