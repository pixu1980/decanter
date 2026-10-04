// An in-app confirmation for destructive actions.
//
// The engine's `confirm()` reads stdin; the renderer owns the terminal, so the
// interface must ask here and then run the command with `yes: true`.
//
// docs: docs/architecture.md

import { theme } from "../../theme.ts";

export interface ConfirmDialogProps {
  title: string;
  message: string;
  detail?: string;
}

/** Render a destructive-action confirmation. */
export function ConfirmDialog({ title, message, detail }: ConfirmDialogProps) {
  return (
    <box
      title={` ${title} `}
      titleColor={theme.danger}
      border
      borderStyle="rounded"
      borderColor={theme.danger}
      style={{ flexDirection: "column", width: 62, paddingX: 2, paddingY: 1, gap: 1, backgroundColor: theme.panel }}
    >
      <text fg={theme.strong}>{message}</text>
      {detail ? <text fg={theme.muted}>{detail}</text> : null}
      <text fg={theme.muted}>y confirm · esc cancel</text>
    </box>
  );
}
