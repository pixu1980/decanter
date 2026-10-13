// One game: its state and the actions that can run on it.
//
// Status sits above the actions, so a narrow terminal never has to fit two
// panels side by side. The panel holds more actions than fit, so only a window
// around the selection is rendered: a flex column with the default shrink
// squeezes its children and the rows overlap, which is what made the labels
// unreadable. Every line is truncated to the width the view has, because
// OpenTUI draws a fixed-width box without clipping its text.
//
// docs: docs/architecture.md

import { useTerminalDimensions } from "@opentui/react";

import type { StatusField } from "../../../core/lifecycle.ts";
import type { GameRow } from "../../helpers/index.ts";
import { theme } from "../../theme.ts";
import { truncate } from "../../text.ts";
import { Panel } from "../Panel/index.ts";
import type { ActionItem } from "../../actions.ts";

export interface GameDetailProps {
  row: GameRow;
  fields: StatusField[];
  actions: ActionItem[];
  selected: number;
  /** Rows the app shell keeps for its own chrome and the activity panel. */
  reserved?: number;
}

/** The inner width of a panel: the app padding, the two borders and paddingX. */
function innerWidth(terminal: number): number {
  return Math.max(20, terminal - 6);
}

/** The rows a slice of actions occupies, counting one header per group change. */
function countRows(actions: ActionItem[], start: number, end: number): number {
  let rows = 0;
  let lastGroup = "";
  for (let index = start; index < end; index += 1) {
    const action = actions[index]!;
    if (action.group !== lastGroup) {
      rows += 1;
    }
    rows += 1;
    lastGroup = action.group;
  }
  return rows;
}

/**
 * The window of actions that fits `size` rows and keeps `selected` visible.
 * Grows to the right first, then to the left, so the list reads naturally.
 */
function windowActions(actions: ActionItem[], selected: number, size: number): { start: number; items: ActionItem[] } {
  let start = Math.min(Math.max(0, selected), Math.max(0, actions.length - 1));
  let end = start + 1;
  for (;;) {
    if (end < actions.length && countRows(actions, start, end + 1) <= size) {
      end += 1;
      continue;
    }
    if (start > 0 && countRows(actions, start - 1, end) <= size) {
      start -= 1;
      continue;
    }
    break;
  }
  return { start, items: actions.slice(start, end) };
}

/** Render the detail view. */
export function GameDetail({ row, fields, actions, selected, reserved = 12 }: GameDetailProps) {
  const { width, height } = useTerminalDimensions();
  const inner = innerWidth(width);
  // Identity (2 rows), the status panel and the gaps, minus what the shell and
  // the activity panel keep for themselves.
  const available = Math.max(8, height - reserved);
  const actionRows = Math.max(4, available - fields.length - 6);
  const { start, items } = windowActions(actions, selected, actionRows);

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      <Identity row={row} width={inner} />
      <StatusPanel fields={fields} width={inner} />
      <ActionsPanel actions={items} offset={start} total={actions.length} selected={selected} width={inner} />
    </box>
  );
}

function Identity({ row, width }: { row: GameRow; width: number }) {
  const { profile } = row;
  const facts = `${profile.slug} · appid ${profile.appid} · depot ${profile.depot || "unset"} · v${profile.version}`;
  return (
    <box style={{ flexDirection: "column", flexShrink: 0 }}>
      <text fg={theme.strong}>{truncate(profile.name, width)}</text>
      <text fg={theme.muted}>{truncate(facts, width)}</text>
    </box>
  );
}

function StatusPanel({ fields, width }: { fields: StatusField[]; width: number }) {
  const labelWidth = Math.min(18, Math.max(12, ...fields.map((field) => field.label.length)));
  return (
    <Panel title="Status">
      {fields.length === 0 ? (
        <text fg={theme.muted}>loading…</text>
      ) : (
        fields.map((field) => (
          <box key={field.label} style={{ flexDirection: "row", flexShrink: 0 }}>
            <box style={{ width: labelWidth + 2, flexShrink: 0 }}>
              <text fg={theme.faint}>{truncate(field.label, labelWidth)}</text>
            </box>
            <text fg={theme.text}>{truncate(field.value, Math.max(8, width - labelWidth - 2))}</text>
          </box>
        ))
      )}
    </Panel>
  );
}

function ActionsPanel({
  actions,
  offset,
  total,
  selected,
  width,
}: {
  actions: ActionItem[];
  offset: number;
  total: number;
  selected: number;
  width: number;
}) {
  const longest = actions.reduce((max, action) => Math.max(max, action.label.length), 0);
  // Give the label the room it needs; the hint absorbs the truncation, so the
  // command names stay readable at any width.
  const labelWidth = Math.min(longest, Math.max(10, width - 12));
  let lastGroup = "";
  return (
    <Panel
      title="Actions"
      flexGrow={1}
      bottomTitle={total > 0 ? ` ${offset + 1}-${offset + actions.length} / ${total} ` : undefined}
    >
      {actions.map((action, position) => {
        const index = offset + position;
        const header = action.group !== lastGroup ? action.group : null;
        lastGroup = action.group;
        const active = index === selected;
        return (
          <box key={action.key} style={{ flexDirection: "column", flexShrink: 0 }}>
            {header ? <text fg={theme.faint}>{truncate(header, width)}</text> : null}
            <box style={{ flexDirection: "row", flexShrink: 0, backgroundColor: active ? theme.selection : undefined }}>
              <text fg={active ? theme.accent : theme.faint}>{active ? "▶ " : "  "}</text>
              <box style={{ width: labelWidth + 2, flexShrink: 0 }}>
                <text fg={active ? theme.strong : theme.text}>{truncate(action.label, labelWidth)}</text>
              </box>
              <text fg={theme.muted}>{truncate(action.hint, Math.max(8, width - labelWidth - 4))}</text>
            </box>
          </box>
        );
      })}
    </Panel>
  );
}
