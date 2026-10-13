import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { updateConfig } from "../../src/core/config.ts";
import { writeJson } from "../../src/core/fsx.ts";
import { buildCatalog, catalogAddArgs, groupCatalog, steamCatalogEntries } from "../../src/core/library.ts";
import { withTempHome } from "./_helpers.ts";

test("buildCatalog merges the store caches", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    // No credential is set: the cache alone must answer.
    await updateConfig({ steamRoot: join(home, "steam") });
    await writeJson(join(home, "gog", "library.json"), {
      at: "",
      games: [{ id: "1207659163", title: "GOG Game", detail: "" }],
    });
    await writeJson(join(home, "epic", "library.json"), {
      at: "",
      games: [{ id: "Anemone", title: "Epic Game", detail: "ns" }],
    });

    const titles = (await buildCatalog()).map((entry) => entry.title);
    assert.ok(titles.includes("GOG Game"));
    assert.ok(titles.includes("Epic Game"));
  });
});

test("buildCatalog collapses duplicate titles within a store", async () => {
  await withTempHome(async () => {
    const home = process.env.DECANTER_HOME!;
    // No credential is set: the epic cache alone must answer.
    await updateConfig({ steamRoot: join(home, "steam") });
    await writeJson(join(home, "epic", "library.json"), {
      at: "",
      games: [
        { id: "a", title: "Train Sim World 7", detail: "ns" },
        { id: "b", title: "Train Sim World 7", detail: "ns" },
        { id: "c", title: "Train Sim World 7", detail: "ns" },
        { id: "d", title: "Live", detail: "ns1" },
        { id: "e", title: "Live", detail: "ns2" },
        { id: "f", title: "Unique Game", detail: "ns3" },
      ],
    });

    const entries = await buildCatalog();
    assert.equal(entries.filter((entry) => entry.title === "Train Sim World 7").length, 1);
    assert.equal(entries.filter((entry) => entry.title === "Live").length, 1);
    assert.equal(entries.filter((entry) => entry.title === "Unique Game").length, 1);
  });
});

test("steamCatalogEntries keeps only apps of type Game", () => {
  const info = new Map([
    [1, { name: "A Game", type: "Game" }],
    [2, { name: "A Tool", type: "Tool" }],
    [3, { name: "Steam Linux Runtime 3.0", type: "Tool" }],
    [4, { name: "A Legacy Game", type: "game" }],
    [5, { name: "A DLC", type: "DLC" }],
    [6, { name: "No Type" }],
  ]);
  const entries = steamCatalogEntries([1, 2, 3, 4, 5, 6], info);
  assert.deepEqual(
    entries.map((entry) => entry.title),
    ["A Game", "A Legacy Game"],
  );
  assert.equal(entries[0]?.store, "steam");
});

test("groupCatalog merges one game owned on several stores", () => {
  const groups = groupCatalog([
    { store: "steam", id: "1", title: "Death Stranding", detail: "", installed: false },
    { store: "epic", id: "Boga", title: "Death Stranding", detail: "ns", installed: false },
    { store: "gog", id: "9", title: "Death Stranding", detail: "", installed: false },
    { store: "steam", id: "2", title: "A Solo Game", detail: "", installed: false },
  ]);
  const death = groups.find((group) => group.title === "Death Stranding");
  assert.deepEqual(death?.entries.map((entry) => entry.store).sort(), ["epic", "gog", "steam"]);
  assert.equal(groups.find((group) => group.title === "A Solo Game")?.entries.length, 1);
});

test("groupCatalog keeps one entry per store, preferring the installed one", () => {
  const groups = groupCatalog([
    { store: "steam", id: "1", title: "Game", detail: "", installed: false },
    { store: "steam", id: "2", title: "Game", detail: "", installed: true },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.entries.length, 1);
  assert.equal(groups[0]?.entries[0]?.id, "2");
  assert.equal(groups[0]?.installed, true);
});

test("groupCatalog matches titles across punctuation", () => {
  const groups = groupCatalog([
    { store: "steam", id: "1", title: "Train Sim World® 7", detail: "", installed: false },
    { store: "epic", id: "x", title: "Train Sim World 7", detail: "", installed: false },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.entries.length, 2);
});

test("catalogAddArgs maps an entry to add options", () => {
  assert.deepEqual(catalogAddArgs({ store: "steam", id: "42", title: "S", detail: "", installed: false }), {
    store: "steam",
    name: "S",
    appid: 42,
  });
  assert.deepEqual(catalogAddArgs({ store: "gog", id: "7", title: "G", detail: "", installed: false }), {
    store: "gog",
    name: "G",
    gogId: 7,
  });
  assert.deepEqual(catalogAddArgs({ store: "epic", id: "Anemone", title: "E", detail: "ns", installed: false }), {
    store: "epic",
    name: "E",
    epicAppName: "Anemone",
  });
});
