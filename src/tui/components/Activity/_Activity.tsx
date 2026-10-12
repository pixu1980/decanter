// Live engine output while an action runs, so the TUI shows what happens
// under the hood instead of only "working…".
//
// docs: docs/architecture.md

import { useTerminalDimensions } from "@opentui/react";

import type { LogLevel } from "../../../core/log.ts";
import { theme } from "../../theme.ts";
import { truncate } from "../../text.ts";
import { Panel } from "../Panel/index.ts";

export interface ActivityLine {
  line: string;
  level: LogLevel;
}

export interface ActivityProps {
  lines: ActivityLine[];
  busy: boolean;
  /** How many trailing lines to show. */
  pageSize?: number;
}

/** Render the tail of the engine output. */
export function Activity({ lines, busy, pageSize = 6 }: ActivityProps) {
  const { width } = useTerminalDimensions();
  const tail = lines.slice(-pageSize);
  return (
    <Panel title={busy ? "Activity · working…" : "Activity"}>
      {tail.length === 0 ? (
        <text fg={theme.muted}>No activity yet.</text>
      ) : (
        tail.map((entry, index) => (
          <box key={`${index}-${entry.line}`} style={{ flexDirection: "row", flexShrink: 0 }}>
            <text fg={entry.level === "warn" ? theme.warning : theme.muted}>
              {truncate(entry.line, Math.max(8, width - 6))}
            </text>
          </box>
        ))
      )}
    </Panel>
  );
}
