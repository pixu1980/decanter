import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  defaultConfig,
  gogConfigured,
  epicConfigured,
  loadConfig,
  missingCredentials,
  saveConfig,
  steamConfigured,
  updateConfig,
} from "../../src/core/config.ts";

let home: string;
const previous = process.env.DECANTER_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "decanter-config-"));
  process.env.DECANTER_HOME = home;
});

afterEach(async () => {
  if (previous === undefined) {
    delete process.env.DECANTER_HOME;
  } else {
    process.env.DECANTER_HOME = previous;
  }
  await rm(home, { recursive: true, force: true });
});

test("the default config carries an empty credential block", () => {
  const config = defaultConfig();
  assert.deepEqual(config.credentials.steam, { apiKey: "", steamId: "" });
  assert.equal(config.credentials.steamGridDb, "");
  assert.deepEqual(config.credentials.gog, { clientId: "", clientSecret: "" });
  assert.deepEqual(config.credentials.epic, { clientId: "", clientSecret: "" });
});

test("no long hex token ships in the default config", () => {
  const json = JSON.stringify(defaultConfig());
  assert.doesNotMatch(json, /[0-9a-f]{24,}/);
});

test("credentials round-trip through config.json", async () => {
  await saveConfig({
    ...defaultConfig(),
    credentials: {
      steam: { apiKey: "steam-key", steamId: "76561190000000000" },
      steamGridDb: "grid-key",
      gog: { clientId: "gog-id", clientSecret: "gog-secret" },
      epic: { clientId: "epic-id", clientSecret: "epic-secret" },
    },
  });
  const loaded = await loadConfig();
  assert.equal(loaded.credentials.steam.apiKey, "steam-key");
  assert.equal(loaded.credentials.steam.steamId, "76561190000000000");
  assert.equal(loaded.credentials.steamGridDb, "grid-key");
  assert.equal(loaded.credentials.gog.clientSecret, "gog-secret");
  assert.equal(loaded.credentials.epic.clientSecret, "epic-secret");
});

test("loadConfig folds the legacy top-level keys into the credential block", async () => {
  await saveConfig({
    ...defaultConfig(),
    // A config written before the credential block moved under `credentials`.
    ...({ steamApiKey: "old-key", steamId: "76561190000000001", steamGridDbKey: "old-grid" } as object),
    credentials: undefined as never,
  });
  const raw = JSON.parse(await readFile(join(home, "config.json"), "utf8")) as Record<string, unknown>;
  delete raw.credentials;
  raw.steamApiKey = "old-key";
  raw.steamId = "76561190000000001";
  raw.steamGridDbKey = "old-grid";
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(home, "config.json"), JSON.stringify(raw));

  const loaded = await loadConfig();
  assert.equal(loaded.credentials.steam.apiKey, "old-key");
  assert.equal(loaded.credentials.steam.steamId, "76561190000000001");
  assert.equal(loaded.credentials.steamGridDb, "old-grid");
});

test("updateConfig merges a credential patch without dropping the rest", async () => {
  const next = await updateConfig({
    credentials: {
      ...defaultConfig().credentials,
      gog: { clientId: "id", clientSecret: "secret" },
    },
  });
  assert.equal(next.credentials.gog.clientId, "id");
  assert.equal(next.credentials.gog.clientSecret, "secret");
  const loaded = await loadConfig();
  assert.equal(loaded.credentials.gog.clientId, "id");
});

test("readiness helpers report the configured providers", () => {
  const config = defaultConfig();
  assert.equal(steamConfigured(config), false);
  assert.equal(gogConfigured(config), false);
  assert.equal(epicConfigured(config), false);

  config.credentials.steam.apiKey = "key";
  config.credentials.gog = { clientId: "id", clientSecret: "secret" };
  assert.equal(steamConfigured(config), true);
  assert.equal(gogConfigured(config), true);
  assert.equal(epicConfigured(config), false);
});

test("missingCredentials lists every unset credential for the wizard", () => {
  const missing = missingCredentials(defaultConfig()).map((field) => field.id);
  assert.deepEqual(missing, [
    "steam.apiKey",
    "steam.steamId",
    "steamGridDb",
    "gog.clientId",
    "gog.clientSecret",
    "epic.clientId",
    "epic.clientSecret",
  ]);

  const config = defaultConfig();
  config.credentials.gog = { clientId: "id", clientSecret: "secret" };
  const rest = missingCredentials(config).map((field) => field.id);
  assert.equal(rest.includes("gog.clientId"), false);
  assert.equal(rest.includes("gog.clientSecret"), false);
});
