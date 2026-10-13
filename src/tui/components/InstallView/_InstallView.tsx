// The install screen: what is being installed and the live engine output.
//
// `add` runs setup, download and import in one step; this screen shows the
// metadata the catalog resolved and streams the engine lines that used to go to
// the bottom activity panel, then the caller returns to the games list.
//
// docs: docs/managing.md

import type { ActivityLine } from "../Activity/index.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface InstallViewProps {
  title: string;
  store: string;
  id: string;
  lines: ActivityLine[];
  busy: boolean;
  /** How many activity lines fit under the metadata panel. */
  pageSize: number;
}

/** Render the installation metadata and the live activity. */
export function InstallView({ title, store, id, lines, busy, pageSize }: InstallViewProps) {
  const tail = lines.slice(-Math.max(1, pageSize));

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      <Panel title={busy ? "Installing…" : "Install"}>
        <Field label="game" value={title} />
        <Field label="store" value={store} />
        <Field label="id" value={id} />
        <Field label="status" value={busy ? "running" : "finished — esc to go back"} />
      </Panel>
      <Panel title="Activity" flexGrow={1} bottomTitle={` ${tail.length} / ${lines.length} `}>
        {tail.length === 0 ? (
          <text fg={theme.muted}>starting…</text>
        ) : (
          tail.map((entry, index) => (
            <text key={`${index}-${entry.line}`} fg={entry.level === "warn" ? theme.warning : theme.text}>
              {entry.line.length > 140 ? `${entry.line.slice(0, 139)}…` : entry.line}
            </text>
          ))
        )}
      </Panel>
    </box>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <box style={{ flexDirection: "row", flexShrink: 0 }}>
      <box style={{ width: 10, flexShrink: 0 }}>
        <text fg={theme.faint}>{label}</text>
      </box>
      <text fg={theme.text}>{value}</text>
    </box>
  );
}
