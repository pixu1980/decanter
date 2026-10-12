#!/usr/bin/env node
// decanter launcher.
//
// Runs the TypeScript CLI. The OpenTUI interface needs Node's FFI, so the flag
// is only added when the TUI is the target; every other command runs with the
// plain runtime. `tsx` supplies the JSX transform for the TUI.
//
// docs: README.md, docs/architecture.md

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertNodeFloor } from "./node-floor.mjs";

assertNodeFloor();

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const entry = join(repoRoot, "src", "cli.ts");
const argv = process.argv.slice(2);

// Resolve `tsx` from this launcher, not from the caller's folder: `--import tsx`
// is a bare specifier Node looks up relative to the working directory, so a run
// from anywhere outside the repo would not find it.
const tsx = import.meta.resolve("tsx");

const wantsTui = argv.length === 0;
const nodeArgs = [];
if (wantsTui) {
  nodeArgs.push("--experimental-ffi");
}
nodeArgs.push("--import", tsx, entry, ...argv);

// tsx finds `tsconfig.json` from the working directory; point it at the repo's
// so the JSX runtime (jsxImportSource `@opentui/react`) is the same everywhere.
const result = spawnSync(process.execPath, nodeArgs, {
  stdio: "inherit",
  env: { ...process.env, TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json") },
});
process.exit(result.status ?? 1);
