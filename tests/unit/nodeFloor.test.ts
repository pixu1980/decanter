import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { atLeast, FLOOR } from "../../bin/node-floor.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("the floor accepts a runtime at or above it and rejects an older one", () => {
  assert.deepEqual(FLOOR, [26, 4]);
  assert.equal(atLeast("26.4.0"), true);
  assert.equal(atLeast("26.8.2"), true);
  assert.equal(atLeast("v26.4.0"), true);
  assert.equal(atLeast("27.0.0"), true);
  assert.equal(atLeast("26.3.9"), false);
  assert.equal(atLeast("25.9.0"), false);
});

test(".nvmrc pins a Node at or above the floor", async () => {
  const pinned = (await readFile(join(ROOT, ".nvmrc"), "utf8")).trim();
  assert.ok(atLeast(pinned), `.nvmrc pins ${pinned}, below the floor`);
});

test("package.json declares no engines field (the floor lives in .nvmrc)", async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  assert.equal(pkg.engines, undefined);
});
