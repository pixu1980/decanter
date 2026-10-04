// A titled, rounded container used by the list, detail and info screens.
//
// docs: docs/architecture.md

import type { ReactNode } from "react";

import { theme } from "../../theme.ts";

export interface PanelProps {
  title: string;
  children: ReactNode;
  width?: number | "auto" | `${number}%`;
  flexGrow?: number;
  borderColor?: string;
  bottomTitle?: string;
}

/** Render a bordered panel with a title on its top edge. */
export function Panel({ title, children, width, flexGrow, borderColor = theme.border, bottomTitle }: PanelProps) {
  return (
    <box
      title={` ${title} `}
      titleColor={theme.accent}
      bottomTitle={bottomTitle}
      bottomTitleAlignment="right"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      style={{ flexDirection: "column", flexGrow, width, paddingX: 1, overflow: "hidden" }}
    >
      {children}
    </box>
  );
}
