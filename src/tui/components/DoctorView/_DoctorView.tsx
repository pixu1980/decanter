// Doctor results for one game.
//
// docs: docs/troubleshooting.md

import type { DoctorCheck } from "../../../core/lifecycle.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface DoctorViewProps {
  title: string;
  checks: DoctorCheck[];
}

const COLORS: Record<DoctorCheck["level"], string> = {
  PASS: theme.success,
  WARN: theme.warning,
  FAIL: theme.danger,
};

/** Render the checks. */
export function DoctorView({ title, checks }: DoctorViewProps) {
  const labelWidth = Math.max(12, ...checks.map((check) => check.label.length));
  const fails = checks.filter((check) => check.level === "FAIL").length;
  const warns = checks.filter((check) => check.level === "WARN").length;

  return (
    <Panel title={title} flexGrow={1} borderColor={fails > 0 ? theme.danger : theme.border}>
      <text fg={theme.muted}>
        {checks.length} checks · {fails} failing · {warns} warning(s)
      </text>
      {checks.map((check) => (
        <box key={`${check.level}-${check.label}`} style={{ flexDirection: "row" }}>
          <text fg={COLORS[check.level]}>{check.level.padEnd(6)}</text>
          <box style={{ width: labelWidth + 2 }}>
            <text fg={theme.text}>{check.label}</text>
          </box>
          {check.detail ? <text fg={theme.muted}>{check.detail}</text> : null}
        </box>
      ))}
    </Panel>
  );
}
