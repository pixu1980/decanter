#!/usr/bin/env node
// The Node version floor.
//
// The README states the floor and `.nvmrc` pins the exact build that CI uses.
// The `engines` field is not used (house rule: pin with `.nvmrc`, enforce the
// floor in the installer and CI), so the launcher and the prepare hook check it
// themselves and stop with a clear message on an older runtime.
//
// docs: CONTRIBUTING.md

/** The minimum `major.minor` this project runs on. */
export const FLOOR = [26, 4];

/** Is `version` (`26.8.2`, `v26.4.0`) at or above `floor`? */
export function atLeast(version, floor = FLOOR) {
  const parts = String(version)
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  return major > floor[0] || (major === floor[0] && minor >= floor[1]);
}

/** Stop with a clear message when the runtime is older than the floor. */
export function assertNodeFloor(version = process.versions.node) {
  if (atLeast(version, FLOOR)) {
    return;
  }
  process.stderr.write(`decanter needs Node ${FLOOR.join(".")} or newer, found ${version}\n`);
  process.exit(1);
}
