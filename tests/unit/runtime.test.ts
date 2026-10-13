import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { setDryRun } from "../../src/core/exec.ts";
import { cmdRuntimeRollback, collectRuntime, readLogTail } from "../../src/core/lifecycle.ts";
import { normalizeProfile } from "../../src/core/profile.ts";
import { getGame, saveGame } from "../../src/core/registry.ts";
import { withTempHome } from "./_helpers.ts";

test("readLogTail falls back to the loader log the bundle writes", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    await saveGame(
      normalizeProfile({
        name: "Test",
        slug: "test",
        appid: 1,
        depot: 2,
        exe: "t.exe",
        paths: { prefix: join(home, "prefix") },
      }),
    );
    await mkdir(join(home, "logs"), { recursive: true });
    await writeFile(join(home, "logs", "test.log"), "line one\nline two\n");

    assert.deepEqual(await readLogTail("test"), ["line one", "line two"]);
  });
});

test("collectRuntime describes the runtime and reports the history", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    process.env.T_WINE_APP = join(home, "no-wine.app");
    await saveGame(
      normalizeProfile({
        name: "Test",
        slug: "test",
        appid: 1,
        depot: 2,
        exe: "t.exe",
        wineRuntime: "gptk",
        runtimeHistory: [{ wineRuntime: "gptk", wineVersion: "", d3dMetal: "3.0", at: "2026-01-01T00:00:00.000Z" }],
      }),
    );

    try {
      const report = await collectRuntime("test");
      const byLabel = new Map(report.fields.map((field) => [field.label, field.value]));
      assert.equal(byLabel.get("description"), "Game Porting Toolkit · WineD3D");
      assert.equal(byLabel.get("latest"), "n/a");
      assert.equal(report.history.length, 1);
      assert.equal(report.history[0]!.d3dMetal, "3.0");
    } finally {
      delete process.env.T_WINE_APP;
    }
  });
});

test("cmdRuntimeRollback selects the previous recorded runtime", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    process.env.T_WINE_APP = join(home, "no-wine.app");
    await saveGame(
      normalizeProfile({
        name: "Test",
        slug: "test",
        appid: 1,
        depot: 2,
        exe: "t.exe",
        wineRuntime: "gptk",
        paths: { prefix: join(home, "prefix") },
        runtimeHistory: [
          { wineRuntime: "wine-devel", wineVersion: "11.18", d3dMetal: "", at: "2026-01-01T00:00:00.000Z" },
          { wineRuntime: "gptk", wineVersion: "", d3dMetal: "3.0", at: "2026-01-02T00:00:00.000Z" },
        ],
      }),
    );

    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    setDryRun(true);
    try {
      await cmdRuntimeRollback("test");
    } finally {
      setDryRun(false);
      process.stdout.write = original;
      delete process.env.T_WINE_APP;
    }

    // A dry run reports the rollback without touching the registry.
    assert.match(chunks.join(""), /gptk → wine-devel \(11\.18\)/);
    assert.equal((await getGame("test")).wineRuntime, "gptk");
  });
});
