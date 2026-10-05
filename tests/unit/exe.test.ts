import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { detectExecutable } from "../../src/core/exe.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "decanter-exe-"));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("detectExecutable prefers the executable matching the game name", async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, "GraveyardKeeper2.exe"), Buffer.alloc(100));
    writeFileSync(join(dir, "UnityCrashHandler64.exe"), Buffer.alloc(500));
    writeFileSync(join(dir, "other-tool.exe"), Buffer.alloc(1000));

    const match = await detectExecutable(dir, "Graveyard Keeper 2");

    assert.equal(match?.exe, "GraveyardKeeper2.exe");
    assert.deepEqual(match?.candidates, ["other-tool.exe", "GraveyardKeeper2.exe"]);
  });
});

test("detectExecutable falls back to the largest executable", async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, "small.exe"), Buffer.alloc(10));
    writeFileSync(join(dir, "big.exe"), Buffer.alloc(2048));

    const match = await detectExecutable(dir, "Unknown Game");

    assert.equal(match?.exe, "big.exe");
  });
});

test("detectExecutable ignores crash handlers and installers", async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, "UnityCrashHandler64.exe"), Buffer.alloc(100));
    writeFileSync(join(dir, "vcredist_x64.exe"), Buffer.alloc(100));
    writeFileSync(join(dir, "unins000.exe"), Buffer.alloc(100));

    assert.equal(await detectExecutable(dir, "Unknown Game"), null);
  });
});

test("detectExecutable returns null when there is no executable", async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, "data.pak"), Buffer.alloc(100));

    assert.equal(await detectExecutable(dir, "Unknown Game"), null);
  });
});
