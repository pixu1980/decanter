// Small filesystem helpers with one clear job each.
//
// Writes and removals honour dry-run mode, so `--dry-run` never touches disk.
//
// docs: docs/architecture.md

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { isDryRun } from "./exec.ts";
import { log } from "./log.ts";

/** Does the path exist? (files, folders, symlinks) */
export function exists(path: string): boolean {
  return existsSync(path);
}

async function ensureParent(file: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
}

/** Create a folder and any missing parents. */
export async function mkdirp(path: string): Promise<void> {
  if (isDryRun()) {
    log(`dry-run: mkdir -p ${path}`);
    return;
  }
  await mkdir(path, { recursive: true });
}

/** Remove a file or folder, ignoring a missing target. */
export async function remove(path: string): Promise<void> {
  if (isDryRun()) {
    log(`dry-run: rm -rf ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
}

/** Read a UTF-8 file, or `null` when it does not exist. */
export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Write a UTF-8 file, creating parent folders. */
export async function writeText(path: string, content: string): Promise<void> {
  if (isDryRun()) {
    log(`dry-run: write ${path}`);
    return;
  }
  await ensureParent(path);
  await writeFile(path, content);
}

/** Write binary data, creating parent folders. */
export async function writeBytes(path: string, data: Uint8Array): Promise<void> {
  if (isDryRun()) {
    log(`dry-run: write ${path}`);
    return;
  }
  await ensureParent(path);
  await writeFile(path, data);
}

/** Read and parse a JSON file, or `null` when missing or invalid. */
export async function readJson<T>(path: string): Promise<T | null> {
  const text = await readText(path);
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Serialize a value as pretty JSON. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Copy a file when it exists, creating the destination folder. */
export async function copyIfExists(from: string, to: string): Promise<boolean> {
  if (!exists(from)) {
    return false;
  }
  if (isDryRun()) {
    log(`dry-run: cp ${from} ${to}`);
    return true;
  }
  await ensureParent(to);
  await copyFile(from, to);
  return true;
}

/** `~` and `~/...` are expanded to the home directory. */
export function tilde(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return `${homedir()}/${path.slice(2)}`;
  }
  return path;
}
