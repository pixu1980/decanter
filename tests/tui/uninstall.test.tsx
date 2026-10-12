// The TUI must never let a lifecycle command read stdin: the renderer owns the
// terminal, so the core confirmation prompt would hang the frame. Destructive
// actions confirm in-app and run with `yes: true`.
//
// docs: docs/architecture.md

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { testRender } from "@opentui/react/test-utils";

import { updateConfig } from "../../src/core/config.ts";
import { normalizeProfile } from "../../src/core/profile.ts";
import { saveGame } from "../../src/core/registry.ts";
import { App } from "../../src/tui/App/index.ts";
import { ACTIONS } from "../../src/tui/actions.ts";

interface Fixture {
  home: string;
  app: string;
}

async function withGame(fn: (fixture: Fixture) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const previous = process.env.DECANTER_HOME;
  process.env.DECANTER_HOME = home;
  try {
    await updateConfig({ applicationsDir: join(home, "Applications") });
    await saveGame(
      normalizeProfile({ name: "Test Game", slug: "test-game", appid: 1, depot: 2, exe: "test.exe" }),
    );
    const app = join(home, "Applications", "Test Game.app");
    mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
    writeFileSync(join(app, "Contents", "MacOS", "launch"), "#!/bin/sh\n");
    await fn({ home, app });
  } finally {
    if (previous === undefined) {
      delete process.env.DECANTER_HOME;
    } else {
      process.env.DECANTER_HOME = previous;
    }
    rmSync(home, { recursive: true, force: true });
  }
}

async function settle(setup: Awaited<ReturnType<typeof testRender>>, ms = 120): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await setup.renderOnce();
}

async function openAction(setup: Awaited<ReturnType<typeof testRender>>, key: string): Promise<void> {
  await setup.waitForFrame((frame) => frame.includes("Test Game"));
  setup.mockInput.pressKey("RETURN");
  await settle(setup);
  const index = ACTIONS.findIndex((action) => action.key === key);
  for (let i = 0; i < index; i += 1) {
    setup.mockInput.pressKey("ARROW_DOWN");
  }
  await settle(setup);
  setup.mockInput.pressKey("RETURN");
  await settle(setup);
}

test("uninstall asks in-app and removes the bundle on confirm", async () => {
  await withGame(async ({ app }) => {
    const setup = await testRender(<App />, { width: 110, height: 40 });
    try {
      await openAction(setup, "uninstall");
      const prompt = setup.captureCharFrame();
      assert.match(prompt, /Remove the app bundle/);

      setup.mockInput.pressKey("y");
      await settle(setup, 300);
      assert.equal(existsSync(app), false, "the app bundle should be gone");
    } finally {
      setup.renderer.destroy();
    }
  });
});

test("uninstall keeps the bundle on cancel", async () => {
  await withGame(async ({ app }) => {
    const setup = await testRender(<App />, { width: 110, height: 40 });
    try {
      await openAction(setup, "uninstall");
      setup.mockInput.pressKey("ESCAPE");
      await settle(setup);
      assert.doesNotMatch(setup.captureCharFrame(), /Remove the app bundle/);
      assert.equal(existsSync(app), true, "the app bundle should still be there");
    } finally {
      setup.renderer.destroy();
    }
  });
});

test("remove purges the data and forgets the game", async () => {
  await withGame(async ({ home }) => {
    const setup = await testRender(<App />, { width: 110, height: 40 });
    try {
      await openAction(setup, "remove");
      setup.mockInput.pressKey("y");
      await settle(setup, 300);
      assert.equal(
        existsSync(join(home, "games", "test-game")),
        false,
        "the registry record should be gone",
      );
      await setup.waitForFrame((frame) => frame.includes("No games registered yet"));
      assert.match(setup.captureCharFrame(), /0 game\(s\)/);
    } finally {
      setup.renderer.destroy();
    }
  });
});
