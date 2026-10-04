import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { detectSteamAccount, loginArgs, parseDepotDownload, steamcmdPath } from "../../src/core/steamcmd.ts";
import { withTempHome } from "./_helpers.ts";

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

test("detectSteamAccount reads the native Steam account name", async () => {
  await withTempHome(async () => {
    const root = join(process.env.SM_HOME!, "Steam");
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(
      join(root, "config", "loginusers.vdf"),
      '"users"\n{\n\t"7656119"\n\t{\n\t\t"AccountName"\t\t"tester"\n\t}\n}\n',
    );
    assert.equal(await detectSteamAccount(root), "tester");
  });
});
