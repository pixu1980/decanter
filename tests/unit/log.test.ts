import assert from "node:assert/strict";
import { test } from "node:test";

import { log, setLogSink, warn } from "../../src/core/log.ts";

test("setLogSink routes log and warn", () => {
  const seen: Array<{ line: string; level: string }> = [];
  setLogSink((line, level) => seen.push({ line, level }));
  try {
    log("hello");
    warn("careful");
  } finally {
    setLogSink(null);
  }

  assert.equal(seen.length, 2);
  assert.match(seen[0]!.line, /hello$/);
  assert.equal(seen[0]!.level, "info");
  assert.equal(seen[1]!.level, "warn");
});
