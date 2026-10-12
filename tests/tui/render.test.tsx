import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { testRender } from "@opentui/react/test-utils";

import { App } from "../../src/tui/App/index.ts";
import { CatalogView } from "../../src/tui/components/CatalogView/index.ts";
import { InstallView } from "../../src/tui/components/InstallView/index.ts";
import { StorePicker } from "../../src/tui/components/StorePicker/index.ts";

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
    assert.match(frame, /Epic/);
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
    for (let i = 0; i < 17; i += 1) {
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

test("the detail lists the CLI-parity actions", async () => {
  const home = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  process.env.DECANTER_HOME = home;
  process.env.TG_WINE_APP = join(home, "no-wine.app");
  mkdirSync(join(home, "games", "test-game"), { recursive: true });
  writeFileSync(
    join(home, "games", "test-game", "game.json"),
    JSON.stringify({ name: "Test Game", slug: "test-game", appid: 1, depot: 2, exe: "t.exe", wineRuntime: "gptk" }),
  );

  const setup = await testRender(<App />, { width: 110, height: 60 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("RETURN");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    for (const label of ["Windowed", "Check update", "Open mods", "Edit profile", "Remove game"]) {
      assert.match(frame, new RegExp(label));
    }
  } finally {
    setup.renderer.destroy();
    delete process.env.TG_WINE_APP;
  }
});

test("c opens the catalog with a filter", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const setup = await testRender(<App />, { width: 100, height: 30 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await setup.renderOnce();
    setup.mockInput.pressKey("c");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /Catalog/);
    assert.match(frame, /Filter/);
  } finally {
    setup.renderer.destroy();
  }
});

test("the catalog renders only a window of rows around the selection", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const games = Array.from({ length: 40 }, (_, position) => {
    const title = `Catalog Game ${position + 1}`;
    return {
      title,
      entries: [{ store: "steam" as const, id: String(1000 + position), title, detail: "", installed: false }],
      installed: false,
    };
  });
  const setup = await testRender(
    <CatalogView games={games} index={20} filter="" onFilter={() => {}} busy={false} pageSize={5} />,
    { width: 90, height: 20 },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /Catalog Game 21/, "the selected row is visible");
    assert.doesNotMatch(frame, /Catalog Game 1\b/, "the first row is out of the window");
    assert.doesNotMatch(frame, /Catalog Game 40/, "the last row is out of the window");
    assert.match(frame, /19-23 \/ 40/, "the window indicator shows the visible range");
  } finally {
    setup.renderer.destroy();
  }
});

test("the install screen shows the metadata and the live activity", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const setup = await testRender(
    <InstallView
      title="Death Stranding"
      store="epic"
      id="Boga"
      lines={[{ line: "epic: downloading build 12.0", level: "info" }]}
      busy
      pageSize={8}
    />,
    { width: 90, height: 24 },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /Installing/);
    assert.match(frame, /Death Stranding/);
    assert.match(frame, /epic/);
    assert.match(frame, /downloading build/);
  } finally {
    setup.renderer.destroy();
  }
});

test("the store picker lists every store a game is owned on", async () => {
  process.env.DECANTER_HOME = mkdtempSync(join(tmpdir(), "decanter-tui-"));
  const entry = (store: "steam" | "epic", id: string) => ({
    store,
    id,
    title: "Death Stranding",
    detail: "",
    installed: false,
  });
  const setup = await testRender(
    <StorePicker title="Death Stranding" entries={[entry("steam", "1190460"), entry("epic", "Boga")]} index={1} />,
    { width: 80, height: 20 },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    assert.match(frame, /Install from/);
    assert.match(frame, /steam/);
    assert.match(frame, /epic/);
    assert.match(frame, /1190460/);
  } finally {
    setup.renderer.destroy();
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
    assert.match(frame, /steam login/);
    assert.match(frame, /gog login/);
    assert.match(frame, /not logged in/);
  } finally {
    setup.renderer.destroy();
  }
});
