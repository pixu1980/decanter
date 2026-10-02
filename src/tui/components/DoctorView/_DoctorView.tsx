// Doctor results for one game.
//
// docs: docs/troubleshooting.md

import type { DoctorCheck } from "../../../core/lifecycle.ts";

export interface DoctorViewProps {
  title: string;
  checks: DoctorCheck[];
}

const COLORS: Record<DoctorCheck["level"], string> = {
  PASS: "#98c379",
  WARN: "#e5c07b",
  FAIL: "#e06c75",
};

/** Render the checks. */
export function DoctorView({ title, checks }: DoctorViewProps) {
  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <text fg="#ffffff">{title}</text>
      <box style={{ flexDirection: "column", paddingLeft: 1 }}>
        {checks.map((check) => (
          <box key={`${check.level}-${check.label}`} style={{ flexDirection: "row", gap: 2 }}>
            <text fg={COLORS[check.level]}>{check.level.padEnd(4)}</text>
            <text fg="#c8ccd4">{check.label}</text>
            {check.detail ? <text fg="#6b7280">{check.detail}</text> : null}
          </box>
        ))}
      </box>
    </box>
  );
}
