import assert from "node:assert/strict";
import { test } from "node:test";

import { CancelledError, cancel, exec, resetCancel } from "../../src/core/exec.ts";

test("cancel aborts a running command", async () => {
  resetCancel();
  const running = exec("sleep", ["10"], { allowFailure: true });
  setTimeout(() => cancel(), 100);
  await assert.rejects(running, (error: unknown) => error instanceof CancelledError);
  resetCancel();
});

test("exec refuses to start while cancelled", async () => {
  cancel();
  await assert.rejects(exec("echo", ["hi"]), (error: unknown) => error instanceof CancelledError);
  resetCancel();
});
