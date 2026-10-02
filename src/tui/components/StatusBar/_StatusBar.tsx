// The bottom line: last message plus the keys that are active right now.
//
// docs: docs/architecture.md

export interface StatusBarProps {
  message: string;
  busy: boolean;
  hints: string;
}

/** Render the status line. */
export function StatusBar({ message, busy, hints }: StatusBarProps) {
  const color = busy ? "#e5c07b" : message.startsWith("error:") ? "#e06c75" : "#98c379";
  const label = busy ? "… working" : message;
  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between", height: 1 }}>
      <text fg={color}>{label}</text>
      <text fg="#5c6370">{hints}</text>
    </box>
  );
}
