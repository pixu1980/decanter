import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeProfile } from "../../src/core/profile.ts";
import { saveGame } from "../../src/core/registry.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function run(args: string[], home: string) {
  const result = spawnSync(process.execPath, [join(ROOT, "src", "cli.ts"), ...args], {
    cwd: ROOT,
    env: { ...process.env, DECANTER_HOME: home },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "decanter-cli-"));
}

test("list with an unknown store fails with a hint", () => {
  const result = run(["list", "definitely-not-a-store"], tempHome());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown store/);
});

test("the launcher runs from any working directory", () => {
  const home = tempHome();
  const cwd = mkdtempSync(join(tmpdir(), "decanter-cwd-"));
  const result = spawnSync(process.execPath, [join(ROOT, "bin", "decanter.mjs"), "version"], {
    cwd,
    env: { ...process.env, DECANTER_HOME: home },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^decanter \d+\.\d+\.\d+/);
});

test("help and version work without a registry", () => {
  const home = tempHome();
  const help = run(["help"], home);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: decanter/);
  assert.match(help.stdout, /download <game>/);

  const version = run(["version"], home);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /^decanter \d+\.\d+\.\d+/);
});

test("list reports an empty registry", () => {
  const result = run(["list"], tempHome());
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no games yet/);
});

test("list gog reads the cache with no credential", async () => {
  const home = tempHome();
  await mkdir(join(home, "gog"), { recursive: true });
  await writeFile(
    join(home, "gog", "library.json"),
    JSON.stringify({ at: "", games: [{ id: "1", title: "Cached GOG Game", detail: "" }] }),
  );
  const result = run(["list", "gog"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Cached GOG Game/);
});

test("list steam reads the client cache with no Web API key", async () => {
  const home = tempHome();
  const steamRoot = join(home, "steam");
  await mkdir(join(steamRoot, "appcache", "librarycache", "440"), { recursive: true });
  await writeFile(join(home, "config.json"), JSON.stringify({ steamRoot }));
  const result = run(["list", "steam"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /440/);
  assert.match(result.stdout, /local cache/);
});

test("list epic fails without a credential when there is no cache", () => {
  const result = run(["list", "epic"], tempHome());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not configured/);
});

test("an unknown command fails with a hint", () => {
  const result = run(["definitely-not-a-command"], tempHome());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown command/);
});

test("config prints the defaults as JSON", () => {
  const result = run(["config"], tempHome());
  assert.equal(result.status, 0);
  assert.match(result.stdout, /"wineRuntime": "gptk"/);
});

test("setup --dry-run plans without creating anything", async () => {
  const home = tempHome();
  process.env.DECANTER_HOME = home;
  await saveGame(
    normalizeProfile({
      name: "Dry Run Game",
      slug: "dry-run-game",
      appid: 1,
      depot: 2,
      paths: { prefix: join(home, "prefix") },
    }),
  );
  delete process.env.DECANTER_HOME;

  const result = run(["setup", "dry-run-game", "--dry-run"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/);
  assert.equal(existsSync(join(home, "prefix")), false);
});
