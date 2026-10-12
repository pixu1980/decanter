// Machine-wide settings: every row is editable or runnable.
//
// docs: docs/managing.md

import type { Config } from "../../../core/config.ts";
import { theme } from "../../theme.ts";
import { Panel } from "../Panel/index.ts";

export interface LoginState {
  steam: boolean;
  gog: boolean;
  epic: boolean;
}

export type SettingKind = "text" | "number" | "select" | "toggle" | "action";

export interface SettingsRow {
  key: string;
  label: string;
  value: string;
  kind: SettingKind;
  options?: string[];
}

/** The editable settings, in display order. */
export function settingsRows(config: Config, logins: LoginState): SettingsRow[] {
  const status = (loggedIn: boolean) => (loggedIn ? "logged in" : "not logged in");
  return [
    { key: "steamRoot", label: "steam root", value: config.steamRoot, kind: "text" },
    { key: "steamApiKey", label: "steam api key", value: config.steamApiKey, kind: "text" },
    { key: "steamId", label: "steam id", value: config.steamId, kind: "text" },
    { key: "applicationsDir", label: "applications", value: config.applicationsDir, kind: "text" },
    { key: "wineRuntime", label: "wine runtime", value: config.wineRuntime, kind: "select", options: ["gptk", "gptk-apple", "wine-devel", "wine-staging"] },
    { key: "gptkApp", label: "game toolkit", value: config.gptkApp, kind: "text" },
    { key: "gptkCask", label: "game toolkit cask", value: config.gptkCask, kind: "text" },
    { key: "appleGptkSource", label: "apple gptk dmg", value: config.appleGptkSource, kind: "text" },
    { key: "steamGridDbKey", label: "steamgriddb key", value: config.steamGridDbKey, kind: "text" },
    { key: "logLines", label: "log lines", value: String(config.logLines), kind: "number" },
    { key: "steamcmd.anonymous", label: "steamcmd anon", value: config.steamcmd.anonymous ? "anonymous" : "account", kind: "toggle" },
    { key: "steamcmd.login", label: "steam login", value: status(logins.steam), kind: "action" },
    { key: "steamcmd.logout", label: "steam logout", value: logins.steam ? "remove the login" : "—", kind: "action" },
    { key: "gog.login", label: "gog login", value: status(logins.gog), kind: "action" },
    { key: "gog.logout", label: "gog logout", value: logins.gog ? "remove the tokens" : "—", kind: "action" },
    { key: "epic.login", label: "epic login", value: status(logins.epic), kind: "action" },
    { key: "epic.logout", label: "epic logout", value: logins.epic ? "remove the tokens" : "—", kind: "action" },
  ];
}

export interface SettingsViewProps {
  rows: SettingsRow[];
  index: number;
  editing: { key: string; value: string } | null;
  /** Which store is waiting for a pasted login code, or `false`. */
  codeOpen: boolean;
  codeStore: "gog" | "epic";
  code: string;
  onCode: (value: string) => void;
  onCodeSubmit: () => void;
  onEditValue: (value: string) => void;
  onEditSubmit: () => void;
}

/** Render the settings list with the focused row highlighted. */
export function SettingsView({
  rows,
  index,
  editing,
  codeOpen,
  codeStore,
  code,
  onCode,
  onCodeSubmit,
  onEditValue,
  onEditSubmit,
}: SettingsViewProps) {
  const labelWidth = Math.max(18, ...rows.map((row) => row.label.length));

  return (
    <Panel title="Settings" flexGrow={1}>
      {rows.map((row, position) => {
        const selected = position === index && !editing;
        const isEditing = editing?.key === row.key;
        const hint =
          row.kind === "text" || row.kind === "number"
            ? "enter edit"
            : row.kind === "select"
              ? "enter cycle"
              : row.kind === "toggle"
                ? "enter toggle"
                : "enter run";
        return (
          <box key={row.key} style={{ flexDirection: "row" }}>
            <box style={{ width: labelWidth + 2 }}>
              <text fg={selected ? theme.accent : theme.faint}>{`${selected ? "› " : "  "}${row.label}`}</text>
            </box>
            {isEditing ? (
              <input value={editing.value} focused placeholder={row.value} onInput={onEditValue} onSubmit={onEditSubmit} />
            ) : (
              <text fg={row.kind === "action" && row.value === "not logged in" ? theme.warning : theme.text}>{row.value}</text>
            )}
            <text fg={theme.muted}>{`   ${hint}`}</text>
          </box>
        );
      })}

      {codeOpen ? (
        <box
          title={codeStore === "epic" ? " Epic authorization code " : " GOG redirect URL or code "}
          titleColor={theme.accent}
          border
          borderStyle="rounded"
          borderColor={theme.borderActive}
          style={{ width: 60, height: 3 }}
        >
          <input
            value={code}
            focused
            placeholder={codeStore === "epic" ? "paste the authorization code" : "paste the redirect URL (or the code)"}
            onInput={onCode}
            onSubmit={onCodeSubmit}
          />
        </box>
      ) : null}

      <text fg={theme.muted}>↑↓ move · enter edit/run · esc back · q quit</text>
    </Panel>
  );
}
