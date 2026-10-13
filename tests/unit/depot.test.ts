import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  clearStaleDepotState,
  depotCacheDirs,
  depotContentDirs,
  depotHasContent,
  findDepotDir,
  gameInstalled,
  importDepot,
  latestManifest,
  readInstalledManifest,
  recordManifest,
  updateStatus,
} from "../../src/core/depot.ts";
import type { GamePaths } from "../../src/core/game.ts";
import { normalizeProfile } from "../../src/core/profile.ts";
import { withTempHome } from "./_helpers.ts";

function makePaths(older: string, prefix: string, installSubdir: string): GamePaths {
  return {
    prefix,
    app: join(older, "Applications", "Game.app"),
    steamRoot: join(older, "Steam"),
    gameDir: join(prefix, "drive_c", installSubdir),
    dataDir: "",
    savesDir: "",
    playerLog: "",
    modsDir: "",
  };
}

test("depotContentDirs covers native Steam and SteamCMD", async () => {
  await withTempHome(async () => {
    const profile = normalizeProfile({ name: "Broken Sword", appid: 57640, depot: 57641 });
    const paths = makePaths("/tmp/older", "/tmp/prefix", profile.installSubdir);
    const dirs = depotContentDirs(paths, profile);
    assert.ok(dirs[0]?.endsWith("steamapps/content/app_57640/depot_57641"));
    assert.ok(dirs.some((dir) => dir.includes("Steam.AppBundle")));
    assert.ok(dirs.some((dir) => dir.includes("steamcmd")));
  });
});

test("latestManifest picks the newest cached manifest", async () => {
  await withTempHome(async () => {
    const profile = normalizeProfile({ name: "Office Management 101", appid: 678390, depot: 678391 });
    const paths = makePaths("/tmp/older", "/tmp/prefix", profile.installSubdir);
    const cache = depotCacheDirs(paths)[0]!;
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, "678391_111.manifest"), "old");
    await writeFile(join(cache, "678391_222.manifest"), "new");
    await utimes(join(cache, "678391_111.manifest"), new Date(1000), new Date(1000));
    await utimes(join(cache, "678391_222.manifest"), new Date(2000), new Date(2000));

    assert.equal(await latestManifest([cache], 678391), "222");
  });
});

test("findDepotDir ignores empty folders", async () => {
  await withTempHome(async () => {
    const empty = join(process.env.DECANTER_HOME!, "empty");
    const full = join(process.env.DECANTER_HOME!, "full");
    await mkdir(empty, { recursive: true });
    await mkdir(full, { recursive: true });
    await writeFile(join(full, "game.exe"), "x");

    assert.equal(await depotHasContent(empty), false);
    assert.equal(await findDepotDir([empty, full]), full);
  });
});

test("importDepot moves the download and records the manifest", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    const profile = normalizeProfile({
      name: "Broken Sword",
      slug: "broken-sword",
      appid: 57640,
      depot: 57641,
      exe: "bs1dc.exe",
    });
    const paths = makePaths(home, join(home, "prefix"), profile.installSubdir);
    const depotDir = depotContentDirs(paths, profile)[0]!;
    await mkdir(depotDir, { recursive: true });
    await writeFile(join(depotDir, "bs1dc.exe"), "game");

    const cache = depotCacheDirs(paths)[0]!;
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, "57641_999.manifest"), "manifest");

    const result = await importDepot(profile, paths);
    assert.equal(result.imported, true);
    assert.equal(result.manifest, "999");
    assert.equal(await gameInstalled(profile, paths), true);
    assert.equal(await readInstalledManifest("broken-sword"), "999");
    assert.equal(await depotHasContent(depotDir), false);
  });
});

test("updateStatus reports available, waiting and current", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    const profile = normalizeProfile({ name: "CWS", slug: "cws", appid: 1, depot: 2 });
    const paths = makePaths(home, join(home, "prefix"), profile.installSubdir);
    const cache = depotCacheDirs(paths)[0]!;
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, "2_5.manifest"), "x");

    assert.equal((await updateStatus(profile, paths)).state, "unknown");

    await mkdir(join(paths.gameDir), { recursive: true });
    await recordManifest("cws", "5");
    assert.equal((await updateStatus(profile, paths)).state, "up-to-date");

    await writeFile(join(cache, "2_6.manifest"), "y");
    assert.equal((await updateStatus(profile, paths)).state, "available");

    const depotDir = depotContentDirs(paths, profile)[0]!;
    await mkdir(depotDir, { recursive: true });
    await writeFile(join(depotDir, "part"), "z");
    assert.equal((await updateStatus(profile, paths)).state, "waiting");
  });
});

test("clearStaleDepotState drops the patch only when the depot is empty", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    const profile = normalizeProfile({ name: "Test", appid: 1, depot: 2 });
    const paths = makePaths(home, join(home, "prefix"), profile.installSubdir);
    const depotDir = depotContentDirs(paths, profile)[0]!;
    const patch = join(dirname(depotDir), "state_1_2.patch");
    await mkdir(dirname(depotDir), { recursive: true });
    await writeFile(patch, "x");

    await clearStaleDepotState(profile, paths);
    assert.equal(existsSync(patch), false, "empty depot: the patch is dropped");

    await mkdir(depotDir, { recursive: true });
    await writeFile(join(depotDir, "part"), "x");
    await writeFile(patch, "x");
    await clearStaleDepotState(profile, paths);
    assert.equal(existsSync(patch), true, "depot with content: the patch is kept");
  });
});
