// The first-run setup: every credential the engine reads, in one screen.
//
// No credential ships in the source, so a fresh install has none. This screen
// shows what is missing and hands the editing to the CLI wizard in a Terminal,
// the same way the migrate and SteamCMD actions do.
//
// docs: docs/managing.md

import type { WizardRow } from "../../../core/wizard.ts";
import { useTerminalDimensions } from "@opentui/react";
import { theme } from "../../theme.ts";
import { truncate } from "../../text.ts";
import { Panel } from "../Panel/index.ts";

export interface SetupViewProps {
  rows: WizardRow[];
}

/** Render the credential checklist. */
export function SetupView({ rows }: SetupViewProps) {
  const set = rows.filter((row) => row.value !== "").length;
  const { width } = useTerminalDimensions();

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      <Panel title="First-run setup" flexGrow={1} bottomTitle={` ${set} / ${rows.length} set `}>
        <text fg={theme.muted}>
          No credential lives in the source. They are stored in ~/.decanter/config.json on this machine only.
        </text>
        {rows.map((row) => (
          <box key={row.field.id} style={{ flexDirection: "row", flexShrink: 0 }}>
            <box style={{ width: 22, flexShrink: 0 }}>
              <text fg={theme.strong}>{row.field.label}</text>
            </box>
            <box style={{ width: 9, flexShrink: 0 }}>
              <text fg={row.value !== "" ? theme.success : theme.muted}>
                {row.value !== "" ? "set" : "missing"}
              </text>
            </box>
            <text fg={theme.faint}>{truncate(row.field.help, Math.max(8, width - 36))}</text>
          </box>
        ))}
        <text fg={theme.muted}>enter — run the wizard in a Terminal · r — re-check · esc — skip</text>
      </Panel>
    </box>
  );
}
