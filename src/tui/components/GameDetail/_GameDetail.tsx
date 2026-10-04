// One game: its state and the actions that can run on it.
//
// docs: docs/architecture.md

import { useTerminalDimensions } from "@opentui/react";

import type { StatusField } from "../../../core/lifecycle.ts";
import type { GameRow } from "../../helpers/index.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";
import type { ActionItem } from "../../actions.ts";

export interface GameDetailProps {
  row: GameRow;
  fields: StatusField[];
  actions: ActionItem[];
  selected: number;
}

/** Render the detail view. */
export function GameDetail({ row, fields, actions, selected }: GameDetailProps) {
  const { width } = useTerminalDimensions();
  const sideBySide = width >= 96;

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      <Identity row={row} />
      <box style={{ flexDirection: sideBySide ? "row" : "column", flexGrow: 1, gap: 1 }}>
        <StatusPanel fields={fields} grow={sideBySide} />
        <ActionsPanel actions={actions} selected={selected} width={sideBySide ? 48 : "auto"} />
      </box>
    </box>
  );
}

function Identity({ row }: { row: GameRow }) {
  const { profile } = row;
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={theme.strong}>{profile.name}</text>
      <text fg={theme.muted}>
        {profile.slug} · appid {profile.appid} · depot {profile.depot || "unset"} · v{profile.version}
      </text>
    </box>
  );
}

function StatusPanel({ fields, grow }: { fields: StatusField[]; grow: boolean }) {
  const labelWidth = Math.max(14, ...fields.map((field) => field.label.length));
  return (
    <Panel title="Status" flexGrow={grow ? 1 : undefined}>
      {fields.length === 0 ? (
        <text fg={theme.muted}>loading…</text>
      ) : (
        fields.map((field) => (
          <box key={field.label} style={{ flexDirection: "row" }}>
            <box style={{ width: labelWidth + 2 }}>
              <text fg={theme.faint}>{field.label}</text>
            </box>
            <text fg={theme.text}>{field.value}</text>
          </box>
        ))
      )}
    </Panel>
  );
}

function ActionsPanel({
  actions,
  selected,
  width,
}: {
  actions: ActionItem[];
  selected: number;
  width: number | "auto";
}) {
  const labelWidth = Math.max(...actions.map((action) => action.label.length)) + 2;
  let lastGroup = "";
  return (
    <Panel title="Actions" width={width}>
      {actions.map((action, index) => {
        const header = action.group !== lastGroup ? action.group : null;
        lastGroup = action.group;
        const active = index === selected;
        return (
          <box key={action.key} style={{ flexDirection: "column" }}>
            {header ? <text fg={theme.faint}>{header}</text> : null}
            <box style={{ flexDirection: "row", backgroundColor: active ? theme.selection : undefined }}>
              <text fg={active ? theme.accent : theme.faint}>{active ? "▶ " : "  "}</text>
              <box style={{ width: labelWidth }}>
                <text fg={active ? theme.strong : theme.text}>{action.label}</text>
              </box>
              <text fg={theme.muted}>{action.hint}</text>
            </box>
          </box>
        );
      })}
    </Panel>
  );
}
