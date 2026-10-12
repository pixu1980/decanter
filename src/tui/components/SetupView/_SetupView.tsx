// The first-run setup: every credential the engine reads, in one screen.
//
// No credential ships in the source, so a fresh install has none. This screen
// shows what is missing and hands the editing to the CLI wizard in a Terminal,
// the same way the migrate and SteamCMD actions do.
//
// docs: docs/managing.md

import type { WizardRow } from "../../../core/wizard.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface SetupViewProps {
  rows: WizardRow[];
}

/** Render the credential checklist. */
export function SetupView({ rows }: SetupViewProps) {
  const set = rows.filter((row) => row.value !== "").length;

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      <Panel title="First-run setup" flexGrow={1} bottomTitle={` ${set} / ${rows.length} set `}>
        <text fg={theme.muted}>
          No credential lives in the source. They are stored in ~/.decanter/config.json on this machine only.
        </text>
        {rows.map((row) => (
          <box key={row.field.id} style={{ flexDirection: "row" }}>
            <box style={{ width: 22 }}>
              <text fg={theme.strong}>{row.field.label}</text>
            </box>
            <box style={{ width: 9 }}>
              <text fg={row.value !== "" ? theme.success : theme.muted}>
                {row.value !== "" ? "set" : "missing"}
              </text>
            </box>
            <text fg={theme.faint}>{row.field.help}</text>
          </box>
        ))}
        <text fg={theme.muted}>enter — run the wizard in a Terminal · r — re-check · esc — skip</text>
      </Panel>
    </box>
  );
}
