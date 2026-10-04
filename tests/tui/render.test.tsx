import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { testRender } from "@opentui/react/test-utils";

import { App } from "../../src/tui/App/index.ts";

test("renders the empty registry", async () => {
  process.env.SM_HOME = mkdtempSync(join(tmpdir(), "steam-mac-tui-"));
  const setup = await testRender(<App />, { width: 80, height: 20 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /steam-mac/);
    assert.match(frame, /No games registered yet/);
    assert.match(frame, /add one from the Steam store/);
  } finally {
    setup.renderer.destroy();
  }
});

test("? opens the keyboard help and esc closes it", async () => {
  process.env.SM_HOME = mkdtempSync(join(tmpdir(), "steam-mac-tui-"));
  const setup = await testRender(<App />, { width: 80, height: 24 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("?");
    await new Promise((resolve) => setTimeout(resolve, 80));
    await setup.renderOnce();
    const help = setup.captureCharFrame();
    assert.match(help, /Keyboard shortcuts/);

    setup.mockInput.pressKey("ESCAPE");
    await new Promise((resolve) => setTimeout(resolve, 80));
    await setup.renderOnce();
    assert.doesNotMatch(setup.captureCharFrame(), /Keyboard shortcuts/);
  } finally {
    setup.renderer.destroy();
  }
});
