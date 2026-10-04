// The tail of the game log, scrolled with the arrow keys.
//
// docs: docs/troubleshooting.md

import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface LogsViewProps {
  title: string;
  lines: string[];
  pageSize: number;
  offset: number;
}

/** Render a window of the log. */
export function LogsView({ title, lines, pageSize, offset }: LogsViewProps) {
  if (lines.length === 0) {
    return (
      <Panel title={title} flexGrow={1}>
        <text fg={theme.muted}>No log yet — start the game once.</text>
      </Panel>
    );
  }

  const start = Math.max(0, lines.length - pageSize - offset);
  const window = lines.slice(start, start + pageSize);

  return (
    <Panel title={title} flexGrow={1} bottomTitle={` ${start + 1}-${start + window.length} / ${lines.length} `}>
      {window.map((line, index) => (
        <box key={`${start + index}`} style={{ flexDirection: "row" }}>
          <text fg={theme.faint}>{String(start + index + 1).padStart(5)} </text>
          <text fg={theme.text}>{line}</text>
        </box>
      ))}
    </Panel>
  );
}
