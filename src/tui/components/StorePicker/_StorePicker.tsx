// The store picker: choose which store to install a catalog game from.
//
// A game owned on more than one store is one catalog row, so the install has to
// ask which store's copy to fetch.
//
// docs: docs/managing.md

import type { CatalogEntry } from "../../../core/library.ts";
import { useTerminalDimensions } from "@opentui/react";
import { theme } from "../../theme.ts";

export interface StorePickerProps {
  title: string;
  entries: CatalogEntry[];
  index: number;
}

const STORE_COLORS: Record<string, string> = {
  steam: theme.accent,
  gog: theme.success,
  epic: theme.warning,
};

/** Render the store choice for one game. */
export function StorePicker({ title, entries, index }: StorePickerProps) {
  const { width } = useTerminalDimensions();
  return (
    <box
      title=" Install from "
      titleColor={theme.accent}
      border
      borderStyle="rounded"
      borderColor={theme.borderActive}
      style={{ flexDirection: "column", width: Math.min(64, Math.max(28, width - 4)), paddingX: 2, paddingY: 1, gap: 1, backgroundColor: theme.panel }}
    >
      <text fg={theme.strong}>{title}</text>
      <text fg={theme.muted}>Owned on more than one store — choose where to install it.</text>
      {entries.map((entry, position) => {
        const active = position === index;
        return (
          <box
            key={entry.store}
            style={{ flexDirection: "row", flexShrink: 0, backgroundColor: active ? theme.selection : undefined }}
          >
            <text fg={active ? theme.strong : theme.text}>
              {active ? "▶ " : "  "}
              {entry.store}
            </text>
            <text fg={STORE_COLORS[entry.store] ?? theme.muted}>{`  ${entry.id}`}</text>
          </box>
        );
      })}
      <text fg={theme.muted}>↑↓ choose · enter install · esc cancel</text>
    </box>
  );
}
