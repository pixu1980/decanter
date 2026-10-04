// The bottom line: last message plus the keys that are active right now.
//
// docs: docs/architecture.md

import { theme, toneColor, toneOf } from "../../theme.ts";

export interface StatusBarProps {
  message: string;
  busy: boolean;
  hints: string;
}

/** Render the status line. */
export function StatusBar({ message, busy, hints }: StatusBarProps) {
  const tone = toneOf(message, busy);
  const label = busy ? "working…" : message;
  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between", height: 1 }}>
      <text fg={toneColor(tone)}>{`● ${label}`}</text>
      <text fg={theme.faint}>{hints}</text>
    </box>
  );
}
