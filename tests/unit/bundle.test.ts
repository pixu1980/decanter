import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp, bundleRuntimeReady } from "../../src/core/bundle.ts";
import type { Config } from "../../src/core/config.ts";
import type { GamePaths } from "../../src/core/game.ts";
import { normalizeProfile } from "../../src/core/profile.ts";
import { readText } from "../../src/core/fsx.ts";
import { resolveWine } from "../../src/core/wine.ts";
import { withTempHome } from "./_helpers.ts";

async function fakeWine(home: string): Promise<string> {
  const app = join(home, "Game Porting Toolkit.app");
  const wine = join(app, "Contents", "Resources", "wine");
  await mkdir(join(wine, "bin"), { recursive: true });
  await mkdir(join(wine, "lib"), { recursive: true });
  await mkdir(join(wine, "share"), { recursive: true });
  for (const bin of ["wine64", "wineserver"]) {
    await writeFile(join(wine, "bin", bin), "#!/bin/sh\n");
    await chmod(join(wine, "bin", bin), 0o755);
  }
  return app;
}

test("buildApp writes a self-hosting bundle", async () => {
  await withTempHome(async () => {
    const home = process.env.SM_HOME!;
    const profile = normalizeProfile({
      name: "Test Game",
      slug: "test-game",
      exe: "test.exe",
      bundleId: "local.test-game",
      version: "1.2.3",
      minMacos: 14,
    });
    const prefix = join(home, "prefix");
    const paths: GamePaths = {
      prefix,
      app: join(home, "Applications", "Test Game.app"),
      steamRoot: join(home, "Steam"),
      gameDir: join(prefix, "drive_c", profile.installSubdir),
      dataDir: "",
      playerLog: "",
      modsDir: "",
    };
    const gptkApp = await fakeWine(home);
    const config = { gptkApp, gptkCask: "cask", applicationsDir: join(home, "Applications") } as Config;
    const runtime = resolveWine(profile, config);

    await buildApp(profile, paths, runtime);

    assert.equal(bundleRuntimeReady(paths.app), true);
    const plist = (await readText(join(paths.app, "Contents", "Info.plist"))) ?? "";
    assert.match(plist, /<string>Test Game<\/string>/);
    assert.match(plist, /local\.test-game/);
    assert.match(plist, /<string>1\.2\.3<\/string>/);
    assert.match(plist, /<string>14\.0<\/string>/);
    assert.doesNotMatch(plist, /LSUIElement/);

    const launch = (await readText(join(paths.app, "Contents", "MacOS", "launch"))) ?? "";
    assert.match(launch, /WINEPREFIX=/);
    assert.match(launch, /exec "\$HERE\/wine64" 'test\.exe'/);
  });
});
