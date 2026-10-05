import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { addGame } from "../../src/core/add.ts";
import { setDryRun } from "../../src/core/exec.ts";
import { normalizeProfile } from "../../src/core/profile.ts";
import { saveGame } from "../../src/core/registry.ts";
import { withTempHome } from "./_helpers.ts";

function fakeStore(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ "42": { success: true, data: { name: "Test Game" } } }), {
      status: 200,
    })) as unknown as typeof fetch;
}

async function capture(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }

  return chunks.join("");
}

async function withDryRun(fn: () => Promise<void>): Promise<void> {
  setDryRun(true);
  try {
    await fn();
  } finally {
    setDryRun(false);
  }
}

test("addGame plans setup, download and import for the new game", async () => {
  await withTempHome(async () => {
    await withDryRun(async () => {
      const output = await capture(() => addGame({ appid: 42, depot: 7, fetchImpl: fakeStore() }));
      assert.match(output, /added Test Game/);
      assert.match(output, /dry-run: would provision test-game: setup → download → import/);
    });
  });
});

test("addGame re-provisions a registered game that is not installed", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    await saveGame(
      normalizeProfile({
        name: "Test Game",
        slug: "test-game",
        appid: 42,
        depot: 7,
        exe: "t.exe",
        paths: { prefix: join(home, "prefix") },
      }),
    );
    await withDryRun(async () => {
      const output = await capture(() => addGame({ appid: 42, depot: 7, fetchImpl: fakeStore() }));
      assert.match(output, /already registered but not installed/);
      assert.match(output, /dry-run: would provision test-game/);
    });
  });
});

test("addGame does nothing when the game is already installed", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    const profile = normalizeProfile({
      name: "Test Game",
      slug: "test-game",
      appid: 42,
      depot: 7,
      exe: "t.exe",
      paths: { prefix: join(home, "prefix") },
    });
    await saveGame(profile);
    const gameDir = join(home, "prefix", "drive_c", profile.installSubdir);
    mkdirSync(gameDir, { recursive: true });
    writeFileSync(join(gameDir, profile.exe), "x");

    await withDryRun(async () => {
      const output = await capture(() => addGame({ appid: 42, depot: 7, fetchImpl: fakeStore() }));
      assert.match(output, /already installed/);
      assert.doesNotMatch(output, /would provision/);
    });
  });
});
