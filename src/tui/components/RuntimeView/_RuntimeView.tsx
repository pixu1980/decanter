// The Wine/Direct3D runtime a game uses, plus the launches recorded for it.
//
// docs: docs/managing.md

import type { StatusField } from "../../../core/lifecycle.ts";
import type { RuntimeSnapshot } from "../../../core/profile.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface RuntimeViewProps {
  title: string;
  fields: StatusField[];
  history: RuntimeSnapshot[];
}

/** Render the runtime fields and the launch history. */
export function RuntimeView({ title, fields, history }: RuntimeViewProps) {
  const labelWidth = Math.max(14, ...fields.map((field) => field.label.length));

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      <Panel title={title} flexGrow={1}>
        {fields.map((field) => (
          <box key={field.label} style={{ flexDirection: "row" }}>
            <box style={{ width: labelWidth + 2 }}>
              <text fg={theme.faint}>{field.label}</text>
            </box>
            <text fg={theme.text}>{field.value}</text>
          </box>
        ))}
      </Panel>
      <Panel title="History" flexGrow={1}>
        {history.length === 0 ? (
          <text fg={theme.muted}>no launch recorded yet — run the game once</text>
        ) : (
          history.map((snapshot) => (
            <text key={`${snapshot.at}-${snapshot.wineRuntime}`} fg={theme.text}>
              {`${snapshot.at}  ${describe(snapshot)}`}
            </text>
          ))
        )}
      </Panel>
    </box>
  );
}

function describe(snapshot: RuntimeSnapshot): string {
  const detail = snapshot.d3dMetal ? `D3DMetal ${snapshot.d3dMetal}` : snapshot.wineVersion || "unpinned";
  return `${snapshot.wineRuntime} (${detail})`;
}
