// The registered games, with the selected row highlighted.
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
}

/** Render the list of games. */
export function GameList({ rows, selected }: GameListProps) {
  const { width } = useTerminalDimensions();
  const nameWidth = Math.max(10, width - 46);
  return (
    <Panel title={`Games${rows.length ? ` (${rows.length})` : ""}`} flexGrow={1}>
      {rows.length === 0
        ? <EmptyState />
        : rows.map((row, index) => renderRow(row, index === selected, nameWidth))}
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
        justifyContent: "space-between",
        backgroundColor: active ? theme.selection : undefined,
      }}
    >
      <text fg={active ? theme.strong : theme.text}>
        {truncate(`${active ? symbols.pointer : " "} ${row.profile.name}`, nameWidth)}
      </text>
      <box style={{ flexDirection: "row", flexShrink: 0, gap: 2 }}>
        <text fg={row.imported ? theme.success : theme.faint}>
          {row.imported ? "installed" : "not installed"}
        </text>
        <text fg={updateColor(row.update)}>{updateLabel(row.update)}</text>
        <text fg={row.hasApp ? theme.success : theme.faint}>{row.hasApp ? "app" : "no app"}</text>
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
