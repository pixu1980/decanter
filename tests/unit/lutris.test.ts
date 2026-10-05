import assert from "node:assert/strict";
import { test } from "node:test";

import { lutrisQueries, parseLutrisInstallers } from "../../src/core/lutris.ts";

test("parseLutrisInstallers collects winetricks and dll overrides", () => {
  const config = parseLutrisInstallers([
    { script: { winetricks: ["d3dx9", "vcrun2019"] } },
    { script: { wine: { dll_overrides: { d3dx9_29: "n", dxgi: "b" } } } },
    { script: { winetricks: "corefonts" } },
  ]);

  assert.deepEqual(config.tricks, ["d3dx9", "vcrun2019", "corefonts"]);
  assert.deepEqual(config.dllOverrides, ["d3dx9_29=n", "dxgi=b"]);
});

test("parseLutrisInstallers tolerates missing scripts", () => {
  assert.deepEqual(parseLutrisInstallers([{}, { script: {} }]), { tricks: [], dllOverrides: [] });
});

test("lutrisQueries loosens a decorated name", () => {
  const queries = lutrisQueries("The Settlers® 2: 10th Anniversary");

  assert.ok(queries.includes("The Settlers® 2: 10th Anniversary"));
  assert.ok(queries.includes("The Settlers 2 10th Anniversary"));
  assert.ok(queries.includes("Settlers 2 10th Anniversary"));
  assert.ok(queries.includes("The Settlers 2"));
  assert.ok(queries.includes("The Settlers"));
});
