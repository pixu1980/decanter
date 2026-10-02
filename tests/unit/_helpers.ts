// Shared test helpers.
//
// docs: docs/plans/execution-plan.md

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Run `fn` with `SM_HOME` pointing at a throwaway folder. */
export async function withTempHome(fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "steam-mac-test-"));
  const previous = process.env.SM_HOME;
  process.env.SM_HOME = dir;
  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.SM_HOME;
    } else {
      process.env.SM_HOME = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
}
