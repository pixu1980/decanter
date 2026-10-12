import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCommit, renderChangelog, renderSection } from "../../src/core/changelog.ts";

test("parseCommit splits type, scope, breaking marker and subject", () => {
  assert.deepEqual(parseCommit("abcdef1234567890", "feat(cli): add the wizard"), {
    hash: "abcdef1",
    type: "feat",
    scope: "cli",
    subject: "add the wizard",
    breaking: false,
  });
  assert.equal(parseCommit("abcdef1", "feat(bundle)!: drop the legacy name")?.breaking, true);
  assert.equal(parseCommit("abcdef1", "no scope here"), null);
});

test("renderSection groups the changelog types and drops the rest", () => {
  const section = renderSection("0.1.0", "2026-10-12", [
    { hash: "1111111", subject: "feat(cli): add the wizard" },
    { hash: "2222222", subject: "fix(list): read the cache first" },
    { hash: "3333333", subject: "chore(deps): bump something" },
    { hash: "4444444", subject: "ci(oss): add the workflow" },
  ]);
  assert.match(section, /## 0\.1\.0 - 2026-10-12/);
  assert.match(section, /### Added/);
  assert.match(section, /- \*\*cli\*\*: add the wizard \(`1111111`\)/);
  assert.match(section, /### Fixed/);
  assert.doesNotMatch(section, /bump something/);
  assert.doesNotMatch(section, /add the workflow/);
});

test("renderSection marks a breaking change and reports an empty section", () => {
  const breaking = renderSection("0.2.0", "2026-11-01", [
    { hash: "aaaaaaa", subject: "feat(bundle)!: drop the legacy name" },
  ]);
  assert.match(breaking, /- \*\*BREAKING\*\* \*\*bundle\*\*: drop the legacy name/);

  const empty = renderSection("0.1.1", "2026-11-02", [{ hash: "bbbbbbb", subject: "chore(x): tidy" }]);
  assert.match(empty, /No user-facing changes\./);
});

test("renderSection cleans the rendered subject", () => {
  const section = renderSection("0.1.0", "2026-10-12", [
    { hash: "1111111", subject: "feat(gog): GOG.com support — provider icons" },
  ]);
  assert.match(section, /- \*\*gog\*\*: GOG support, provider icons/);
  assert.doesNotMatch(section, /GOG\.com/);
});

test("renderChangelog opens with the generated header", () => {
  const changelog = renderChangelog([
    { version: "0.1.0", date: "2026-10-12", commits: [{ hash: "1111111", subject: "feat(cli): add the wizard" }] },
  ]);
  assert.match(changelog, /^# Changelog/);
  assert.match(changelog, /Generated from the commits by/);
  assert.match(changelog, /## 0\.1\.0 - 2026-10-12/);
});
