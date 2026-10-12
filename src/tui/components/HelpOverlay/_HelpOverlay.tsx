// The `?` overlay: every key binding in one place.
//
// docs: docs/architecture.md

import { useTerminalDimensions } from "@opentui/react";

import { theme } from "../../theme.ts";
import { VERSION } from "../../../core/version.ts";

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
      { keys: "q", label: "quit (except the add wizard)" },
    ],
  },
  {
    title: "Game list",
    shortcuts: [
      { keys: "↑ ↓ / k j", label: "move" },
      { keys: "enter", label: "open" },
      { keys: "a", label: "add a game" },
      { keys: "c", label: "open the catalog" },
      { keys: "s", label: "settings" },
      { keys: "m", label: "migrate a legacy repo (Terminal)" },
      { keys: "r", label: "refresh" },
    ],
  },
  {
    title: "Game detail and logs",
    shortcuts: [
      { keys: "↑ ↓ / k j", label: "move, or scroll the log" },
      { keys: "enter", label: "run the selected action" },
      { keys: "esc", label: "back" },
    ],
  },
  {
    title: "While an action runs",
    shortcuts: [
      { keys: "esc", label: "cancel the running action" },
    ],
  },
];

/** Render the keyboard reference. */
export function HelpOverlay() {
  const { width } = useTerminalDimensions();
  return (
    <box
      title=" Keyboard shortcuts "
      titleColor={theme.accent}
      border
      borderStyle="rounded"
      borderColor={theme.border}
      style={{ flexDirection: "column", width: Math.min(58, Math.max(24, width - 4)), paddingX: 2, paddingY: 1, gap: 0, backgroundColor: theme.panel }}
    >
      {SECTIONS.map((section) => (
        <box key={section.title} style={{ flexDirection: "column" }}>
          <text fg={theme.accent}>{section.title}</text>
          {section.shortcuts.map((shortcut) => (
            <box key={shortcut.keys} style={{ flexDirection: "row", flexShrink: 0 }}>
              <text fg={theme.strong}>{`  ${shortcut.keys.padEnd(12)}`}</text>
              <text fg={theme.muted}>{shortcut.label}</text>
            </box>
          ))}
        </box>
      ))}
      <text fg={theme.muted}>{`Activity streams the log · esc/? close · decanter ${VERSION}`}</text>
    </box>
  );
}
