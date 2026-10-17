// The game list: the window around the selection, and rows that never wrap.
//
// docs: docs/architecture.md

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { testRender } from "@opentui/react/test-utils";

import { App } from "../../src/tui/App/index.ts";

/** Register `count` games named `Game 00`, `Game 01`, … */
function seedGames(count: number, name: (index: number) => string): string {
  const home = mkdtempSync(join(tmpdir(), "decanter-list-"));
  process.env.DECANTER_HOME = home;
  for (let index = 0; index < count; index += 1) {
    const slug = `game-${index}`;
    mkdirSync(join(home, "games", slug), { recursive: true });
    writeFileSync(
      join(home, "games", slug, "game.json"),
      JSON.stringify({
        name: name(index),
        slug,
        appid: 1000 + index,
        depot: 2000 + index,
        exe: "t.exe",
        wineRuntime: "gptk",
      }),
    );
  }

  return home;
}

/** Render the interface and return the frame once the list has loaded. */
async function frame(setup: Awaited<ReturnType<typeof testRender>>, keys: string[] = []): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  for (const key of keys) {
    setup.mockInput.pressKey(key);
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  await setup.renderOnce();

  return setup.captureCharFrame();
}

test("the list renders the window around the selection", async () => {
  seedGames(30, (index) => `Game ${String(index).padStart(2, "0")}`);
  const setup = await testRender(<App />, { width: 80, height: 20 });
  try {
    const first = await frame(setup);
    assert.match(first, /Game 00/);
    assert.match(first, /1-12 \/ 30/);

    const scrolled = await frame(
      setup,
      Array.from({ length: 20 }, () => "ARROW_DOWN"),
    );
    assert.match(scrolled, /15-26 \/ 30/);
    assert.match(scrolled, /▶\s+Game 20/);
    assert.doesNotMatch(scrolled, /1-12 \/ 30/);
  } finally {
    setup.renderer.destroy();
  }
});

test("a long name is truncated instead of wrapped", async () => {
  seedGames(12, () => "The Settlers II 10th Anniversary");
  const setup = await testRender(<App />, { width: 56, height: 24 });
  try {
    const current = await frame(setup);
    assert.match(current, /The Sett/);
    assert.match(current, /…/);
    assert.doesNotMatch(current, /Anniversary/);
    assert.equal(current.match(/not installed/g)?.length, 12);
  } finally {
    setup.renderer.destroy();
  }
});

test("a name of wide glyphs does not wrap either", async () => {
  seedGames(6, (index) => `グラフィックアドベンチャーゲーム日本語版 ${index}`);
  const setup = await testRender(<App />, { width: 80, height: 24 });
  try {
    const current = await frame(setup);
    // The tail of the name would only show up on a second line.
    assert.doesNotMatch(current, /語版/);
    assert.equal(current.match(/not installed/g)?.length, 6);
  } finally {
    setup.renderer.destroy();
  }
});
