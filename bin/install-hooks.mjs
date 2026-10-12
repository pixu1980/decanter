#!/usr/bin/env node
// Install the repository's git hooks.
//
// Runs from `prepare` on `pnpm install`, so a fresh clone gets the commit-msg
// rule without a manual step. It writes into .git/hooks/ rather than setting
// `core.hooksPath`, which would replace a contributor's global hook directory
// instead of adding to it.
//
// docs: CONTRIBUTING.md

import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertNodeFloor } from "./node-floor.mjs";

// The install step enforces the floor before anything else runs.
assertNodeFloor();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = join(root, ".git");
const source = join(root, ".githooks", "commit-msg");

// Nothing to do outside a normal checkout: a global install from the package
// directory, a tarball, or a worktree whose .git is a file.
if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) {
  process.exit(0);
}

const hooksDir = join(gitDir, "hooks");
mkdirSync(hooksDir, { recursive: true });
const target = join(hooksDir, "commit-msg");
copyFileSync(source, target);
chmodSync(target, 0o755);
process.stdout.write(`installed ${target}\n`);
