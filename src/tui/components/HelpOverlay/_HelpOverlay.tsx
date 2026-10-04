// The `?` overlay: every key binding in one place.
//
// docs: docs/architecture.md

import { theme } from "../../theme.ts";

interface Shortcut {
  keys: string;
  label: string;
}

interface Section {
  title: string;
  shortcuts: Shortcut[];
}

const SECTIONS: Section[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: "?", label: "toggle this help" },
      { keys: "q", label: "quit (game list only)" },
    ],
  },
  {
    title: "Game list",
    shortcuts: [
      { keys: "↑ ↓ / k j", label: "move" },
      { keys: "enter", label: "open" },
      { keys: "a", label: "add a game" },
      { keys: "s", label: "settings" },
      { keys: "r", label: "refresh" },
    ],
  },
  {
    title: "Game detail",
    shortcuts: [
      { keys: "↑ ↓ / k j", label: "move between actions" },
      { keys: "enter", label: "run the selected action" },
      { keys: "esc", label: "back" },
    ],
  },
  {
    title: "Logs and info",
    shortcuts: [
      { keys: "↑ ↓", label: "scroll the log" },
      { keys: "esc", label: "back" },
    ],
  },
];

/** Render the keyboard reference. */
export function HelpOverlay() {
  return (
    <box
      title=" Keyboard shortcuts "
      titleColor={theme.accent}
      border
      borderStyle="rounded"
      borderColor={theme.border}
      style={{ flexDirection: "column", width: 58, paddingX: 2, paddingY: 1, gap: 1, backgroundColor: theme.panel }}
    >
      {SECTIONS.map((section) => (
        <box key={section.title} style={{ flexDirection: "column" }}>
          <text fg={theme.accent}>{section.title}</text>
          {section.shortcuts.map((shortcut) => (
            <box key={shortcut.keys} style={{ flexDirection: "row" }}>
              <text fg={theme.strong}>{`  ${shortcut.keys.padEnd(12)}`}</text>
              <text fg={theme.muted}>{shortcut.label}</text>
            </box>
          ))}
        </box>
      ))}
      <text fg={theme.muted}>esc or ? to close</text>
    </box>
  );
}
