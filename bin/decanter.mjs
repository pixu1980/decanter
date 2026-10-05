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

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "src", "cli.ts");
const argv = process.argv.slice(2);

const wantsTui = argv.length === 0 || argv[0] === "tui" || argv[0] === "ui";
const nodeArgs = [];
if (wantsTui) {
  nodeArgs.push("--experimental-ffi");
}
nodeArgs.push("--import", "tsx", entry, ...argv);

const result = spawnSync(process.execPath, nodeArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
