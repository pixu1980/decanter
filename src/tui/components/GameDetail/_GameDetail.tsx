// One game: its state and the actions that can run on it.
//
// docs: docs/architecture.md

import type { StatusField } from "../../../core/lifecycle.ts";
import type { GameRow } from "../../helpers/index.ts";

/** One selectable action. */
export interface ActionItem {
  key: string;
  label: string;
  hint: string;
}

export interface GameDetailProps {
  row: GameRow;
  fields: StatusField[];
  actions: ActionItem[];
  selected: number;
}

/** Render the detail view. */
export function GameDetail({ row, fields, actions, selected }: GameDetailProps) {
  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <box style={{ flexDirection: "column" }}>
        <text fg="#ffffff">{row.profile.name}</text>
        <text fg="#6b7280">
          {row.profile.slug} · appid {row.profile.appid} · depot {row.profile.depot || "unset"}
        </text>
      </box>

      <box style={{ flexDirection: "column", paddingLeft: 1 }}>
        {fields.map((field) => (
          <box key={field.label} style={{ flexDirection: "row", gap: 1 }}>
            <text fg="#7f848e">{field.label.padEnd(14)}</text>
            <text fg="#c8ccd4">{field.value}</text>
          </box>
        ))}
      </box>

      <box style={{ flexDirection: "column", paddingLeft: 1 }}>
        {actions.map((action, index) => {
          const active = index === selected;
          return (
            <box key={action.key} style={{ flexDirection: "row", gap: 2, backgroundColor: active ? "#2f3b52" : undefined }}>
              <text fg={active ? "#ffffff" : "#c8ccd4"}>
                {active ? "▶ " : "  "}
                {action.label}
              </text>
              <text fg="#6b7280">{action.hint}</text>
            </box>
          );
        })}
      </box>
    </box>
  );
}
