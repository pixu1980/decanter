// The registered games, with the selected row highlighted.
//
// docs: docs/architecture.md

import type { GameRow } from "../../helpers/index.ts";

export interface GameListProps {
  rows: GameRow[];
  selected: number;
}

/** Render the list of games. */
export function GameList({ rows, selected }: GameListProps) {
  if (rows.length === 0) {
    return (
      <box style={{ padding: 1 }}>
        <text fg="#888888">No games registered yet.{"\n\n"}Press a to add one from the Steam store.</text>
      </box>
    );
  }

  return (
    <box style={{ flexDirection: "column" }}>
      {rows.map((row, index) => {
        const active = index === selected;
        return (
          <box
            key={row.profile.slug}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: active ? "#2f3b52" : undefined,
            }}
          >
            <text fg={active ? "#ffffff" : "#c8ccd4"}>
              {active ? "▶ " : "  "}
              {row.profile.name}
            </text>
            <text fg="#6b7280">
              {row.imported ? "installed" : "not installed"} · {updateLabel(row.update)} · {row.hasApp ? "app" : "no app"}
            </text>
          </box>
        );
      })}
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
