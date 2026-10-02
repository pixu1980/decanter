// Machine-wide settings.
//
// docs: docs/managing.md

import type { Config } from "../../../core/config.ts";

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

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <text fg="#ffffff">Settings</text>
      <box style={{ flexDirection: "column", paddingLeft: 1 }}>
        {rows.map(([label, value]) => (
          <box key={label} style={{ flexDirection: "row", gap: 2 }}>
            <text fg="#7f848e">{label.padEnd(14)}</text>
            <text fg="#c8ccd4">{value}</text>
          </box>
        ))}
      </box>
      <text fg="#6b7280">a toggle SteamCMD anonymous · edit the file with: steam-mac config key=value</text>
    </box>
  );
}
