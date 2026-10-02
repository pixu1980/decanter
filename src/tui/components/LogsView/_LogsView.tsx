// The tail of the game log, scrolled with the arrow keys.
//
// docs: docs/troubleshooting.md

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
      <box style={{ flexDirection: "column" }}>
        <text fg="#ffffff">{title}</text>
        <text fg="#888888">No log yet — start the game once.</text>
      </box>
    );
  }

  const start = Math.max(0, lines.length - pageSize - offset);
  const window = lines.slice(start, start + pageSize);

  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ flexDirection: "row", gap: 2 }}>
        <text fg="#ffffff">{title}</text>
        <text fg="#6b7280">
          {start + 1}-{start + window.length} / {lines.length}
        </text>
      </box>
      <box style={{ flexDirection: "column", paddingLeft: 1 }}>
        {window.map((line, index) => (
          <text key={`${start + index}`} fg="#c8ccd4">
            {line}
          </text>
        ))}
      </box>
    </box>
  );
}
