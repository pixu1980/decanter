import assert from "node:assert/strict";
import { test } from "node:test";

import { addGame } from "../../src/core/add.ts";
import { setDryRun } from "../../src/core/exec.ts";
import { withTempHome } from "./_helpers.ts";

function fakeStore(name: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ "4358690": { success: true, data: { name } } }), {
      status: 200,
    })) as unknown as typeof fetch;
}

async function withDryRun(fn: () => Promise<void>): Promise<void> {
  setDryRun(true);
  try {
    await fn();
  } finally {
    setDryRun(false);
  }
}

test("addGame fills Graveyard Keeper 2 from the catalog", async () => {
  await withTempHome(async () => {
    await withDryRun(async () => {
      const profile = await addGame({
        appid: 4358690,
        fetchImpl: fakeStore("Graveyard Keeper 2"),
      });

      assert.equal(profile.exe, "GraveyardKeeper2.exe");
      assert.equal(profile.installSubdir, "GK2");
      assert.equal(profile.depot, 4358691);
      assert.equal(profile.dataSubdir, "users/crossover/AppData/LocalLow/Lazy Bear Games/Graveyard Keeper 2");
      assert.equal(profile.bundleId, "local.gravemac-keeper-2");
      assert.equal(profile.window.enabled, true);
      assert.equal(profile.window.regKey, "HKCU\\Software\\Lazy Bear Games\\Graveyard Keeper 2");
      assert.deepEqual(profile.savePatterns, ["*.dat", "*.info"]);
      assert.equal(profile.versionPattern, "Starting game, ver\\. [0-9A-Za-z.]+");
    });
  });
});

test("an explicit --exe overrides the catalog", async () => {
  await withTempHome(async () => {
    await withDryRun(async () => {
      const profile = await addGame({
        appid: 4358690,
        exe: "Custom.exe",
        fetchImpl: fakeStore("Graveyard Keeper 2"),
      });

      assert.equal(profile.exe, "Custom.exe");
    });
  });
});

test("a game without a catalog entry keeps the generic profile", async () => {
  await withTempHome(async () => {
    await withDryRun(async () => {
      const fake = (async () =>
        new Response(JSON.stringify({ "42": { success: true, data: { name: "Test Game" } } }), {
          status: 200,
        })) as unknown as typeof fetch;
      const profile = await addGame({ appid: 42, depot: 7, fetchImpl: fake });

      assert.equal(profile.exe, "test-game.exe");
      assert.equal(profile.installSubdir, "test-game");
      assert.equal(profile.window.enabled, false);
    });
  });
});
