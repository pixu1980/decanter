import assert from "node:assert/strict";
import { test } from "node:test";

import { loginArgs, parseDepotDownload, steamcmdPath } from "../../src/core/steamcmd.ts";

test("loginArgs uses anonymous when configured", () => {
  assert.deepEqual(loginArgs({ anonymous: true }), ["+login", "anonymous"]);
});

test("loginArgs uses the account without a stored password", () => {
  assert.deepEqual(loginArgs({ anonymous: false, username: "emiliano" }), ["+login", "emiliano"]);
});

test("loginArgs includes the password when present", () => {
  assert.deepEqual(loginArgs({ anonymous: false, username: "emiliano", password: "secret" }), [
    "+login",
    "emiliano",
    "secret",
  ]);
});

test("parseDepotDownload reads the path and manifest", () => {
  const output = '...\nDepot download complete : "/Users/me/.steam-mac/steamcmd/steamapps/content/app_57640/depot_57641" (1234 files, manifest 987654321)\nOK';
  const parsed = parseDepotDownload(output);
  assert.equal(parsed.depotDir, "/Users/me/.steam-mac/steamcmd/steamapps/content/app_57640/depot_57641");
  assert.equal(parsed.manifest, "987654321");
});

test("parseDepotDownload tolerates a missing manifest", () => {
  const parsed = parseDepotDownload('Depot download complete : "/tmp/depot_1"');
  assert.equal(parsed.depotDir, "/tmp/depot_1");
  assert.equal(parsed.manifest, undefined);
});

test("parseDepotDownload returns nothing for unrelated output", () => {
  assert.equal(parseDepotDownload("Connecting...").depotDir, undefined);
});

test("steamcmdPath lives under the runtime home", () => {
  assert.match(steamcmdPath(), /steamcmd\/steamcmd\.sh$/);
});
