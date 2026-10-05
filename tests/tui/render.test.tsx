import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { testRender } from "@opentui/react/test-utils";

import { App } from "../../src/tui/App/index.ts";

test("renders the empty registry", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const setup = await testRender(<App />, { width: 80, height: 20 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /decanter/);
    assert.match(frame, /No games registered yet/);
    assert.match(frame, /add one from the Steam store/);
  } finally {
    setup.renderer.destroy();
  }
});

test("? opens the keyboard help and esc closes it", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const setup = await testRender(<App />, { width: 80, height: 24 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("?");
    await new Promise((resolve) => setTimeout(resolve, 80));
    await setup.renderOnce();
    const help = setup.captureCharFrame();
    assert.match(help, /Keyboard shortcuts/);
    assert.match(help, /cancel the running action/);

    setup.mockInput.pressKey("ESCAPE");
    await new Promise((resolve) => setTimeout(resolve, 80));
    await setup.renderOnce();
    assert.doesNotMatch(setup.captureCharFrame(), /Keyboard shortcuts/);
  } finally {
    setup.renderer.destroy();
  }
});

test("the add wizard shows an Install button", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const setup = await testRender(<App />, { width: 90, height: 40 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("a");
    await new Promise((resolve) => setTimeout(resolve, 80));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /Add a game/);
    assert.match(frame, /Install/);
  } finally {
    setup.renderer.destroy();
  }
});

test("the add wizard offers a Steam/GOG store select", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const setup = await testRender(<App />, { width: 90, height: 40 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("a");
    await new Promise((resolve) => setTimeout(resolve, 80));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /Store/);
    assert.match(frame, /Steam/);
    assert.match(frame, /GOG/);
  } finally {
    setup.renderer.destroy();
  }
});

test("the detail view opens the runtime panel", async () => {
  const home = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  process.env.DECANTER_HOME = home;
  process.env.TG_WINE_APP = join(home, "no-wine.app");
  mkdirSync(join(home, "games", "test-game"), { recursive: true });
  writeFileSync(
    join(home, "games", "test-game", "game.json"),
    JSON.stringify({
      name: "Test Game",
      slug: "test-game",
      appid: 1,
      depot: 2,
      exe: "t.exe",
      wineRuntime: "gptk",
      runtimeHistory: [
        { wineRuntime: "gptk", wineVersion: "", d3dMetal: "3.0", at: "2026-01-01T00:00:00.000Z" },
      ],
    }),
  );

  const setup = await testRender(<App />, { width: 100, height: 30 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("RETURN");
    await new Promise((resolve) => setTimeout(resolve, 150));
    for (let i = 0; i < 10; i += 1) {
      setup.mockInput.pressKey("ARROW_DOWN");
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    await setup.renderOnce();
    setup.mockInput.pressKey("RETURN");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /Runtime/);
    assert.match(frame, /History/);
    assert.match(frame, /D3DMetal 3.0/);
  } finally {
    setup.renderer.destroy();
    delete process.env.TG_WINE_APP;
  }
});

test("settings show the store logins", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const setup = await testRender(<App />, { width: 90, height: 40 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("s");
    await new Promise((resolve) => setTimeout(resolve, 120));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /steamcmd login/);
    assert.match(frame, /gog login/);
    assert.match(frame, /not logged in/);
  } finally {
    setup.renderer.destroy();
  }
});
