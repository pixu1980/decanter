import assert from "node:assert/strict";
import { test } from "node:test";

import { addGame } from "../../src/core/add.ts";
import { knownGogGame } from "../../src/core/catalog.ts";
import { setDryRun } from "../../src/core/exec.ts";
import { rosettaWow64Fix } from "../../src/core/wow64.ts";
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
      assert.equal(profile.wineRuntime, "gptk-apple");
      assert.equal(profile.window.enabled, true);
      assert.equal(profile.window.regKey, "HKCU\\Software\\Lazy Bear Games\\Graveyard Keeper 2");
      assert.deepEqual(profile.savePatterns, ["*.dat", "*.info"]);
      assert.equal(profile.versionPattern, "Starting game, ver\\. [0-9A-Za-z.]+");
    });
  });
});

test("the GOG catalog carries the Settlers II wine tweaks", () => {
  const known = knownGogGame(1207659163);
  assert.equal(known?.wineRuntime, "wine-devel");
  // 11.18 is the version with a prebuilt Rosetta wow64cpu fix (see wow64.ts).
  assert.equal(known?.wineVersion, "11.18");
  assert.ok(rosettaWow64Fix(known?.wineVersion ?? ""), "the pinned version has a wow64 fix");
  assert.equal(known?.exe, "bin/S2DNG.exe");
  assert.deepEqual(known?.wine?.tricks, ["d3dx9"]);
  assert.equal(known?.wine?.virtualDesktop, "1280x720");
});

test("addGame fills Game Dev Studio from the catalog", async () => {
  await withTempHome(async () => {
    await withDryRun(async () => {
      const profile = await addGame({
        appid: 773580,
        fetchImpl: fakeStore("Game Dev Studio"),
      });

      assert.equal(profile.depot, 773581);
      assert.equal(profile.exe, "game_dev_studio.exe");
      assert.equal(profile.slug, "game-dev-studio");
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

test("an explicit --runtime overrides the catalog", async () => {
  await withTempHome(async () => {
    await withDryRun(async () => {
      const profile = await addGame({
        appid: 4358690,
        runtime: "gptk",
        fetchImpl: fakeStore("Graveyard Keeper 2"),
      });

      assert.equal(profile.wineRuntime, "gptk");
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
