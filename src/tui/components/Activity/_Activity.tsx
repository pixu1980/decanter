// Live engine output while an action runs, so the TUI shows what happens
// under the hood instead of only "working…".
//
// docs: docs/architecture.md

import type { LogLevel } from "../../../core/log.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface ActivityLine {
  line: string;
  level: LogLevel;
}

export interface ActivityProps {
  lines: ActivityLine[];
  busy: boolean;
  /** How many trailing lines to show. */
  height?: number;
}

/** Render the tail of the engine output. */
export function Activity({ lines, busy, height = 6 }: ActivityProps) {
  const tail = lines.slice(-height);
  return (
    <Panel title={busy ? "Activity · working…" : "Activity"}>
      {tail.length === 0 ? (
        <text fg={theme.muted}>No activity yet.</text>
      ) : (
        tail.map((entry, index) => (
          <text key={`${index}-${entry.line}`} fg={entry.level === "warn" ? theme.warning : theme.muted}>
            {entry.line.length > 140 ? `${entry.line.slice(0, 139)}…` : entry.line}
          </text>
        ))
      )}
    </Panel>
  );
}
