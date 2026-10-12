import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { CREDENTIAL_FIELDS, defaultConfig, loadConfig } from "../../src/core/config.ts";
import { applyAnswers, setCredential, wizardRows } from "../../src/core/wizard.ts";

let home: string;
const previous = process.env.DECANTER_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "decanter-wizard-"));
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

test("wizardRows lists every credential field in order", () => {
  const rows = wizardRows(defaultConfig());
  assert.deepEqual(
    rows.map((row) => row.field.id),
    CREDENTIAL_FIELDS.map((field) => field.id),
  );
  assert.equal(rows[0]!.value, "");
});

test("applyAnswers writes trimmed values and ignores unknown ids", () => {
  const next = applyAnswers(defaultConfig(), {
    "gog.clientId": "  gog-id  ",
    "gog.clientSecret": "gog-secret",
    nonsense: "ignored",
  });
  assert.equal(next.credentials.gog.clientId, "gog-id");
  assert.equal(next.credentials.gog.clientSecret, "gog-secret");
  // The source config is untouched.
  assert.equal(defaultConfig().credentials.gog.clientId, "");
});

test("setCredential persists one value", async () => {
  await setCredential("epic.clientId", "epic-id");
  const loaded = await loadConfig();
  assert.equal(loaded.credentials.epic.clientId, "epic-id");
});

test("setCredential rejects an unknown id", async () => {
  await assert.rejects(() => setCredential("nope", "x"), /unknown credential/);
});
