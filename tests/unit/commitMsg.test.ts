import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../../.githooks/commit-msg", import.meta.url));

function check(message: string): number {
  const dir = mkdtempSync(join(tmpdir(), "decanter-hook-"));
  const file = join(dir, "COMMIT_EDITMSG");
  writeFileSync(file, message);
  return spawnSync("sh", [HOOK, file], { encoding: "utf8" }).status ?? 1;
}

test("the commit-msg hook accepts a scoped conventional commit", () => {
  assert.equal(check("feat(cli): add the wizard"), 0);
  assert.equal(check("docs(oss): add the security policy"), 0);
  assert.equal(check("fix(bundle)!: drop the legacy name"), 0);
});

test("the commit-msg hook rejects a scope-less or free-form message", () => {
  assert.equal(check("fix: no scope"), 1);
  assert.equal(check("added a thing"), 1);
  assert.equal(check("feat(cli) add the wizard"), 1);
});

test("the commit-msg hook ignores merge and revert subjects", () => {
  assert.equal(check("Merge branch 'main'"), 0);
  assert.equal(check('Revert "feat(cli): add the wizard"'), 0);
});
