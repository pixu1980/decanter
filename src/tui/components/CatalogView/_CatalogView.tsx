// The catalog: every owned game in one filterable table, one row per game.
//
// A game owned on more than one store is a single row listing its stores; the
// store picker chooses where to install it. The list can hold hundreds of rows,
// so only the window around the selection is rendered: a flex column lays out
// every child it is given, and an overlong list would push the rows over the
// panel instead of scrolling.
//
// docs: docs/managing.md

import type { CatalogGame } from "../../../core/library.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface CatalogViewProps {
  games: CatalogGame[];
  index: number;
  filter: string;
  onFilter: (value: string) => void;
  busy: boolean;
  /** Rows the panel can show; only a window around `index` is rendered. */
  pageSize: number;
}

const STORE_COLORS: Record<string, string> = {
  steam: theme.accent,
  gog: theme.success,
  epic: theme.warning,
};

/** Render the catalog table with a filter input. */
export function CatalogView({ games, index, filter, onFilter, busy, pageSize }: CatalogViewProps) {
  const idWidth = 22;
  const storesWidth = 16;
  const total = games.length;
  const size = Math.max(1, Math.min(pageSize, total || 1));
  const maxStart = Math.max(0, total - size);
  const start = Math.min(Math.max(0, index - Math.floor(size / 2)), maxStart);
  const visible = games.slice(start, start + size);

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      <box
        title=" Filter "
        titleColor={theme.accent}
        border
        borderStyle="rounded"
        borderColor={theme.borderActive}
        style={{ width: 52, height: 3 }}
      >
        <input value={filter} focused placeholder="type to filter by name or store" onInput={onFilter} />
      </box>

      <Panel
        title={`Catalog (${total})`}
        flexGrow={1}
        bottomTitle={total > 0 ? ` ${start + 1}-${start + visible.length} / ${total} ` : undefined}
      >
        <box style={{ flexDirection: "row" }}>
          <box style={{ width: 2 }}>
            <text fg={theme.muted}> </text>
          </box>
          <box style={{ flexGrow: 1 }}>
            <text fg={theme.faint}>name</text>
          </box>
          <box style={{ width: storesWidth }}>
            <text fg={theme.faint}>stores</text>
          </box>
          <box style={{ width: idWidth }}>
            <text fg={theme.faint}>id</text>
          </box>
          <box style={{ width: 10 }}>
            <text fg={theme.faint}>status</text>
          </box>
        </box>

        {total === 0 ? (
          <text fg={theme.muted}>{filter ? "no match" : busy ? "loading…" : "the catalog is empty — run list steam|gog|epic"}</text>
        ) : (
          visible.map((game, offset) => {
            const position = start + offset;
            const active = position === index;
            const primary = game.entries[0];
            return (
              <box
                key={`${catalogKey(game)}-${position}`}
                style={{ flexDirection: "row", backgroundColor: active ? theme.selection : undefined }}
              >
                <box style={{ width: 2 }}>
                  <text fg={theme.accent}>{active ? "▶" : " "}</text>
                </box>
                <box style={{ flexGrow: 1 }}>
                  <text fg={active ? theme.strong : theme.text}>{game.title}</text>
                </box>
                <box style={{ width: storesWidth }}>{storesLabel(game)}</box>
                <box style={{ width: idWidth }}>
                  <text fg={theme.faint}>{primary ? truncate(primary.id, idWidth - 1) : ""}</text>
                </box>
                <box style={{ width: 10 }}>
                  <text fg={game.installed ? theme.success : theme.muted}>{game.installed ? "installed" : "—"}</text>
                </box>
              </box>
            );
          })
        )}
      </Panel>
    </box>
  );
}

/** The store list of a row, coloured per store. */
function storesLabel(game: CatalogGame) {
  return (
    <box style={{ flexDirection: "row" }}>
      {game.entries.map((entry, position) => (
        <text key={entry.store} fg={STORE_COLORS[entry.store] ?? theme.muted}>
          {position > 0 ? ", " : ""}
          {entry.store}
        </text>
      ))}
    </box>
  );
}

function catalogKey(game: CatalogGame): string {
  return game.entries.map((entry) => `${entry.store}-${entry.id}`).join("|");
}

function truncate(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value;
}
