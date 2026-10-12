// Responsive layout tests: the interface must stay inside the terminal at every
// width, and nothing may be drawn over anything else.
//
// OpenTUI renders text over its neighbour when a flex column is overfull (the
// children shrink and the rows overlap), which is what made the labels
// unreadable. `assertIntact` catches it: an interleaved line no longer contains
// the label as a contiguous string.
//
// docs: docs/architecture.md

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { test } from "node:test";

import { testRender } from "@opentui/react/test-utils";

import { defaultConfig } from "../../src/core/config.ts";
import type { StatusField } from "../../src/core/lifecycle.ts";
import { normalizeProfile } from "../../src/core/profile.ts";
import { wizardRows } from "../../src/core/wizard.ts";
import { ACTIONS } from "../../src/tui/actions.ts";
import { App } from "../../src/tui/App/index.ts";
import { ConfirmDialog } from "../../src/tui/components/ConfirmDialog/index.ts";
import { GameDetail } from "../../src/tui/components/GameDetail/index.ts";
import { HelpOverlay } from "../../src/tui/components/HelpOverlay/index.ts";
import { SetupView } from "../../src/tui/components/SetupView/index.ts";
import { StorePicker } from "../../src/tui/components/StorePicker/index.ts";
import type { GameRow } from "../../src/tui/helpers/index.ts";

const WIDTHS = [48, 60, 72, 80, 100, 140];

/** Every captured line fits the renderer width. */
function assertFits(frame: string, width: number): void {
  for (const line of frame.split("\n")) {
    assert.ok(line.length <= width, `a line is wider than ${width}: ${JSON.stringify(line)}`);
  }
}

/** A string is drawn contiguously, so nothing was interleaved over it. */
function assertIntact(frame: string, value: string): void {
  assert.ok(frame.includes(value), `not rendered contiguously: ${JSON.stringify(value)}`);
}

async function render(node: ReactNode, width: number, height: number): Promise<string> {
  const setup = await testRender(node, { width, height });
  try {
    for (let i = 0; i < 20; i += 1) {
      await setup.renderOnce();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return setup.captureCharFrame();
  } finally {
    setup.renderer.destroy();
  }
}

function detailProps() {
  const row = {
    profile: normalizeProfile({
      name: "The Cosmic Wheel Sisterhood",
      slug: "the-cosmic-wheel-sisterhood",
      appid: 1340480,
      depot: 1340481,
      exe: "The_Cosmic_Wheel_Sisterhood.exe",
      wineRuntime: "gptk",
    }),
    imported: true,
    update: "up-to-date",
    hasApp: true,
  } as unknown as GameRow;
  const fields: StatusField[] = [
    { label: "prefix", value: "missing (/var/folders/73/kklbvjbj0gx6g23dq4lsd5w80000gn/T/decanter-test)" },
    { label: "app bundle", value: `/Users/someone/Applications/${"Long Name ".repeat(8)}.app` },
  ];
  return { row, fields };
}

test("the game detail keeps status above the actions", async () => {
  const { row, fields } = detailProps();
  for (const width of WIDTHS) {
    const frame = await render(<GameDetail row={row} fields={fields} actions={ACTIONS} selected={4} />, width, 40);
    assertFits(frame, width);
    const status = frame.indexOf("Status");
    const actions = frame.indexOf("Actions");
    assert.ok(status >= 0 && actions > status, `status must sit above the actions at ${width}`);
    // Both panels are on their own line, never the same row.
    const statusLine = frame.split("\n").findIndex((line) => line.includes("Status"));
    const actionsLine = frame.split("\n").findIndex((line) => line.includes("Actions"));
    assert.ok(actionsLine > statusLine, `panels share a row at ${width}`);
  }
});

test("the game detail labels and hints never overlap", async () => {
  const { row, fields } = detailProps();
  for (const width of WIDTHS) {
    const frame = await render(<GameDetail row={row} fields={fields} actions={ACTIONS} selected={0} />, width, 60);
    assertFits(frame, width);
    // A label is always drawn whole; a hint is truncated when the width is too
    // small, which is fine, so it is only checked where it fits.
    for (const action of ACTIONS) {
      assertIntact(frame, action.label);
      if (width >= 100) {
        assertIntact(frame, action.hint);
      }
    }
    assertIntact(frame, "The Cosmic Wheel Sisterhood");
  }
});

test("the help overlay fits a narrow terminal", async () => {
  for (const width of WIDTHS) {
    const frame = await render(<HelpOverlay />, width, 20);
    assertFits(frame, width);
    assertIntact(frame, "Keyboard shortcuts");
    assertIntact(frame, "toggle this help");
  }
});

test("the store picker fits a narrow terminal", async () => {
  const entries = [
    { store: "steam" as const, id: "1190460", title: "Death Stranding", detail: "", installed: false },
    { store: "epic" as const, id: "Boga", title: "Death Stranding", detail: "", installed: false },
  ];
  for (const width of WIDTHS) {
    const frame = await render(<StorePicker title="Death Stranding" entries={entries} index={0} />, width, 20);
    assertFits(frame, width);
    assertIntact(frame, "Install from");
    assertIntact(frame, "steam");
    assertIntact(frame, "epic");
  }
});

test("the confirm dialog fits a narrow terminal", async () => {
  for (const width of WIDTHS) {
    const frame = await render(
      <ConfirmDialog title="Remove game" message="Remove the app bundle?" detail="The prefix is kept." />,
      width,
      20,
    );
    assertFits(frame, width);
    assertIntact(frame, "Remove the app bundle?");
    assertIntact(frame, "y confirm");
  }
});

test("the setup screen fits a narrow terminal", async () => {
  for (const width of WIDTHS) {
    const frame = await render(<SetupView rows={wizardRows(defaultConfig())} />, width, 24);
    assertFits(frame, width);
    assertIntact(frame, "First-run setup");
    assertIntact(frame, "Steam Web API key");
  }
});

test("the app views stay inside a narrow terminal", async () => {
  const home = mkdtempSync(join(tmpdir(), "decanter-responsive-"));
  const previous = process.env.DECANTER_HOME;
  process.env.DECANTER_HOME = home;
  mkdirSync(join(home, "games", "test-game"), { recursive: true });
  writeFileSync(
    join(home, "games", "test-game", "game.json"),
    JSON.stringify({ name: "A Very Long Game Title That Should Be Truncated", slug: "test-game", appid: 1, depot: 2, exe: "t.exe" }),
  );
  try {
    for (const width of WIDTHS) {
      const setup = await testRender(<App />, { width, height: 30 });
      try {
        for (let i = 0; i < 25; i += 1) {
          await setup.renderOnce();
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const list = setup.captureCharFrame();
        assertFits(list, width);
        assertIntact(list, "Games (1)");

        setup.mockInput.pressKey("RETURN");
        for (let i = 0; i < 25; i += 1) {
          await setup.renderOnce();
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const detail = setup.captureCharFrame();
        assertFits(detail, width);
        assertIntact(detail, "Status");
        assertIntact(detail, "Actions");
        assertIntact(detail, "open the app bundle");
      } finally {
        setup.renderer.destroy();
      }
    }
  } finally {
    if (previous === undefined) {
      delete process.env.DECANTER_HOME;
    } else {
      process.env.DECANTER_HOME = previous;
    }
  }
});
