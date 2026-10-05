import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { test } from "node:test";

import { detectSteamAccount, loginArgs, parseDepotDownload, parseWindowsDepot, steamcmdHasLogin, steamcmdPath } from "../../src/core/steamcmd.ts";
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
  const output = '...\nDepot download complete : "/Users/me/.decanter/steamcmd/steamapps/content/app_57640/depot_57641" (1234 files, manifest 987654321)\nOK';
  const parsed = parseDepotDownload(output);
  assert.equal(parsed.depotDir, "/Users/me/.decanter/steamcmd/steamapps/content/app_57640/depot_57641");
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

test("parseDepotDownload normalizes Windows separators", () => {
  const parsed = parseDepotDownload('Depot download complete : "C:\\steam\\steamapps\\content\\app_1\\depot_2" (5 files, manifest 9)');
  assert.equal(parsed.depotDir, "C:/steam/steamapps/content/app_1/depot_2");
  assert.equal(parsed.manifest, "9");
});

test("steamcmdPath lives under the runtime home", () => {
  assert.match(steamcmdPath(), /steamcmd\/steamcmd\.sh$/);
});

test("detectSteamAccount reads the native Steam account name", async () => {
  await withTempHome(async () => {
    const root = join(process.env.DECANTER_HOME!, "Steam");
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(
      join(root, "config", "loginusers.vdf"),
      '"users"\n{\n\t"7656119"\n\t{\n\t\t"AccountName"\t\t"tester"\n\t}\n}\n',
    );
    assert.equal(await detectSteamAccount(root), "tester");
  });
});

test("parseWindowsDepot picks the Windows content depot", () => {
  const vdf = `"773580"
{
	"appinfo"
	{
		"depots"
		{
			"baselanguages"		"english"
			"228986"
			{
				"config"
				{
					"oslist"		"windows"
				}
				"depotfromapp"		"228980"
				"sharedinstall"		"1"
			}
			"773581"
			{
				"config"
				{
					"oslist"		"windows"
				}
				"manifests"
				{
					"public"
					{
						"gid"		"123"
					}
				}
			}
			"773582"
			{
				"config"
				{
					"oslist"		"linux"
				}
				"manifests"
				{
					"public"
					{
						"gid"		"456"
					}
				}
			}
		}
	}
}
`;

  assert.equal(parseWindowsDepot(vdf), 773581);
  assert.equal(parseWindowsDepot(""), null);
});

test("steamcmdHasLogin reads the account from config.vdf", async () => {
  await withTempHome(async () => {
    const cfg = join(
      process.env.DECANTER_HOME!,
      "steamcmd",
      "home",
      "Library",
      "Application Support",
      "Steam",
      "config",
      "config.vdf",
    );
    await mkdir(dirname(cfg), { recursive: true });
    assert.equal(await steamcmdHasLogin(), false);

    await writeFile(
      cfg,
      '"Steam"\n{\n\t"Accounts"\n\t{\n\t\t"me"\n\t\t{\n\t\t\t"SteamID"\t\t"76561198117039314"\n\t\t}\n\t}\n}\n',
    );
    assert.equal(await steamcmdHasLogin(), true);
  });
});
