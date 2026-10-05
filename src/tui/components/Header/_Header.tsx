// The top line: product name, current screen and the contextual right side.
//
// docs: docs/architecture.md

import { symbols, theme } from "../../theme.ts";

export interface HeaderProps {
  breadcrumb: string;
  right: string;
}

/** Render the header bar. */
export function Header({ breadcrumb, right }: HeaderProps) {
  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between", height: 1 }}>
      <box style={{ flexDirection: "row" }}>
        <text fg={theme.accent}>decanter</text>
        <text fg={theme.faint}>{` ${symbols.chevron} `}</text>
        <text fg={theme.text}>{breadcrumb}</text>
      </box>
      <text fg={theme.muted}>{right}</text>
    </box>
  );
}
