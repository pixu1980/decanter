// Machine-wide settings.
//
// docs: docs/managing.md

import type { Config } from "../../../core/config.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface SettingsViewProps {
  config: Config;
}

/** Render the current settings. */
export function SettingsView({ config }: SettingsViewProps) {
  const rows: Array<[string, string]> = [
    ["steam root", config.steamRoot],
    ["applications", config.applicationsDir],
    ["wine runtime", config.wineRuntime],
    ["game toolkit", config.gptkApp],
    ["steamcmd", config.steamcmd.anonymous ? "anonymous" : `account ${config.steamcmd.username ?? "?"}`],
    ["log lines", String(config.logLines)],
  ];
  const labelWidth = Math.max(14, ...rows.map(([label]) => label.length));

  return (
    <Panel title="Settings" flexGrow={1}>
      {rows.map(([label, value]) => (
        <box key={label} style={{ flexDirection: "row" }}>
          <box style={{ width: labelWidth + 2 }}>
            <text fg={theme.faint}>{label}</text>
          </box>
          <text fg={theme.text}>{value}</text>
        </box>
      ))}
      <text fg={theme.muted}>a toggle SteamCMD anonymous · edit with: steam-mac config key=value</text>
    </Panel>
  );
}
