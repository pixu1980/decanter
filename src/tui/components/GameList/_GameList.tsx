// The registered games, with the selected row highlighted.
//
// The registry can hold more games than the panel has rows, so only the window
// around the selection is rendered: a flex column lays out every child it is
// given, and an overlong list would push the rows over the panel instead of
// scrolling. The status columns are fixed and the name never wraps, so a name
// can never change the height of a row.
//
// docs: docs/architecture.md

import { useTerminalDimensions } from "@opentui/react";

import type { GameRow } from "../../helpers/index.ts";
import { symbols, theme } from "../../theme.ts";
import { truncate } from "../../text.ts";
import { Panel } from "../Panel/index.ts";

export interface GameListProps {
  rows: GameRow[];
  selected: number;
  /** Rows the panel can show; only a window around `selected` is rendered. */
  pageSize: number;
}

/** Fixed widths of the columns at the right of the name, and the gap between them. */
const COLUMNS = { status: 13, update: 16, app: 6, gap: 2 } as const;

/** Cells a row spends outside the name: the columns above plus the shell chrome (padding and border). */
const RESERVED_CELLS = 6 + COLUMNS.status + COLUMNS.update + COLUMNS.app + COLUMNS.gap * 2;

/** Render the window of the list around the selection. */
export function GameList({ rows, selected, pageSize }: GameListProps) {
  const { width } = useTerminalDimensions();
  const nameWidth = Math.max(8, width - RESERVED_CELLS);
  const total = rows.length;
  const size = Math.max(1, Math.min(pageSize, total || 1));
  const maxStart = Math.max(0, total - size);
  const start = Math.min(Math.max(0, selected - Math.floor(size / 2)), maxStart);
  const visible = rows.slice(start, start + size);

  return (
    <Panel
      title={`Games${total ? ` (${total})` : ""}`}
      flexGrow={1}
      bottomTitle={total > 0 ? ` ${start + 1}-${start + visible.length} / ${total} ` : undefined}
    >
      {total === 0 ? (
        <EmptyState />
      ) : (
        visible.map((row, offset) => renderRow(row, start + offset === selected, nameWidth))
      )}
    </Panel>
  );
}

function EmptyState() {
  return (
    <box style={{ flexDirection: "column", paddingY: 1, gap: 1 }}>
      <text fg={theme.text}>No games registered yet.</text>
      <text fg={theme.muted}>Press a to add one from the Steam store.</text>
    </box>
  );
}

function renderRow(row: GameRow, active: boolean, nameWidth: number) {
  return (
    <box
      key={row.profile.slug}
      style={{
        flexDirection: "row",
        flexShrink: 0,
        backgroundColor: active ? theme.selection : undefined,
      }}
    >
      <box style={{ flexGrow: 1, flexShrink: 1 }}>
        {/* OpenTUI wraps text by default, which would give an overlong name a second row.
            `wrapMode="none"` clips it to the column, by display cells: the budget below
            counts code units, so wide glyphs are cut by the renderer, not by `truncate`. */}
        <text fg={active ? theme.strong : theme.text} wrapMode="none">
          {truncate(`${active ? symbols.pointer : " "} ${row.profile.name}`, nameWidth)}
        </text>
      </box>
      <box style={{ flexDirection: "row", flexShrink: 0, gap: COLUMNS.gap }}>
        <box style={{ width: COLUMNS.status }}>
          <text fg={row.imported ? theme.success : theme.faint}>{row.imported ? "installed" : "not installed"}</text>
        </box>
        <box style={{ width: COLUMNS.update }}>
          <text fg={updateColor(row.update)}>{updateLabel(row.update)}</text>
        </box>
        <box style={{ width: COLUMNS.app }}>
          <text fg={row.hasApp ? theme.success : theme.faint}>{row.hasApp ? "app" : "no app"}</text>
        </box>
      </box>
    </box>
  );
}

function updateLabel(state: GameRow["update"]): string {
  if (state === "available") {
    return "update available";
  }
  if (state === "waiting") {
    return "download waiting";
  }
  if (state === "up-to-date") {
    return "up to date";
  }

  return "state unknown";
}

function updateColor(state: GameRow["update"]): string {
  if (state === "available") {
    return theme.warning;
  }
  if (state === "up-to-date") {
    return theme.success;
  }

  return theme.faint;
}
