// The application shell: view routing, keyboard handling and status line.
//
// Screens stay presentational; this file owns state and calls the lifecycle
// commands through `safeAction`, so console output never breaks the frame.
//
// docs: docs/architecture.md

import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { addGame } from "../../core/add.ts";
import { type Config, loadConfig, updateConfig } from "../../core/config.ts";
import { exec } from "../../core/exec.ts";
import { exists } from "../../core/fsx.ts";
import { resolveGamePaths } from "../../core/game.ts";
import {
  cmdApp,
  cmdBackupSaves,
  cmdDownload,
  cmdIcon,
  cmdImport,
  cmdSaves,
  cmdSetup,
  cmdUninstall,
  cmdUpdate,
  collectDoctor,
  collectStatus,
  readLogTail,
  type DoctorCheck,
  type StatusField,
} from "../../core/lifecycle.ts";
import { AddWizard, type AddValues } from "../components/AddWizard/index.ts";
import { DoctorView } from "../components/DoctorView/index.ts";
import { GameDetail, type ActionItem } from "../components/GameDetail/index.ts";
import { GameList } from "../components/GameList/index.ts";
import { LogsView } from "../components/LogsView/index.ts";
import { SettingsView } from "../components/SettingsView/index.ts";
import { StatusBar } from "../components/StatusBar/index.ts";
import { refreshGames, safeAction, type GameRow } from "../helpers/index.ts";

type View =
  | { name: "games" }
  | { name: "detail"; slug: string }
  | { name: "add" }
  | { name: "doctor"; slug: string }
  | { name: "logs"; slug: string }
  | { name: "settings" };

const ACTIONS: ActionItem[] = [
  { key: "run", label: "Run", hint: "open the app bundle" },
  { key: "setup", label: "Setup", hint: "runtime, prefix, icon, bundle" },
  { key: "download", label: "Download", hint: "SteamCMD, or the Steam console" },
  { key: "import", label: "Import", hint: "move the depot into the prefix" },
  { key: "update", label: "Update", hint: "check and install" },
  { key: "app", label: "Rebuild app", hint: "bundle with menu and Cmd+Q" },
  { key: "icon", label: "Fetch icon", hint: "from the Steam CDN" },
  { key: "doctor", label: "Doctor", hint: "health checks" },
  { key: "logs", label: "Logs", hint: "tail the game log" },
  { key: "saves", label: "Open saves", hint: "in Finder" },
  { key: "backup", label: "Backup saves", hint: "to ~/Documents" },
  { key: "uninstall", label: "Uninstall", hint: "remove the app bundle" },
];

/** Render the interface. */
export function App() {
  const renderer = useRenderer();
  const { height } = useTerminalDimensions();

  const [rows, setRows] = useState<GameRow[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [view, setView] = useState<View>({ name: "games" });
  const [listIndex, setListIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [fields, setFields] = useState<StatusField[]>([]);
  const [checks, setChecks] = useState<DoctorCheck[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [logOffset, setLogOffset] = useState(0);
  const [status, setStatus] = useState("ready");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setConfig(await loadConfig());
    setRows(await refreshGames());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = rows[listIndex]?.profile ?? null;

  const openDetail = useCallback((slug: string) => {
    setActionIndex(0);
    setFields([]);
    setView({ name: "detail", slug });
    void collectStatus(slug)
      .then((report) => setFields(report.fields))
      .catch(() => setFields([]));
  }, []);

  const runAction = useCallback(
    async (action: string) => {
      if (!current) {
        return;
      }
      setBusy(true);
      try {
        if (action === "run") {
          if (!config) {
            return;
          }
          const paths = resolveGamePaths(current, config);
          if (!exists(paths.app)) {
            setStatus("error: no app bundle yet — run Setup first");
            return;
          }
          const result = await safeAction(() => exec("open", [paths.app]));
          setStatus(result.ok ? `launched ${current.name}` : `error: ${result.message}`);
          return;
        }
        if (action === "doctor") {
          const report = await collectDoctor(current.slug);
          setChecks(report.checks);
          setView({ name: "doctor", slug: current.slug });
          setStatus(`${report.checks.length} checks, ${report.fails} failing`);
          return;
        }
        if (action === "logs") {
          setLogOffset(0);
          setLogs(await readLogTail(current.slug, 500));
          setView({ name: "logs", slug: current.slug });
          setStatus("logs loaded");
          return;
        }
        const commands: Record<string, () => Promise<unknown>> = {
          setup: () => cmdSetup(current.slug),
          download: () => cmdDownload(current.slug),
          import: () => cmdImport(current.slug),
          update: () => cmdUpdate(current.slug),
          app: () => cmdApp(current.slug),
          icon: () => cmdIcon(current.slug),
          saves: () => cmdSaves(current.slug, { open: true }),
          backup: () => cmdBackupSaves(current.slug),
          uninstall: () => cmdUninstall(current.slug, {}),
        };
        const command = commands[action];
        if (!command) {
          return;
        }
        const result = await safeAction(command);
        setStatus(result.ok ? result.message : `error: ${result.message}`);
        await reload();
        if (view.name === "detail") {
          const report = await collectStatus(current.slug);
          setFields(report.fields);
        }
      } finally {
        setBusy(false);
      }
    },
    [config, current, reload, view.name],
  );

  useKeyboard((key) => {
    if (busy || view.name === "add") {
      return;
    }
    const name = key.name;

    if (view.name === "games") {
      if (name === "q") {
        renderer.destroy();
        return;
      }
      if (name === "up" || name === "k") {
        setListIndex((index) => Math.max(0, index - 1));
      }
      if (name === "down" || name === "j") {
        setListIndex((index) => Math.min(rows.length - 1, index + 1));
      }
      if (name === "return" && current) {
        openDetail(current.slug);
      }
      if (name === "a") {
        setView({ name: "add" });
      }
      if (name === "s") {
        setView({ name: "settings" });
      }
      if (name === "r") {
        void reload();
      }
      return;
    }

    if (view.name === "detail") {
      if (name === "escape") {
        setView({ name: "games" });
      }
      if (name === "up" || name === "k") {
        setActionIndex((index) => Math.max(0, index - 1));
      }
      if (name === "down" || name === "j") {
        setActionIndex((index) => Math.min(ACTIONS.length - 1, index + 1));
      }
      if (name === "return") {
        const action = ACTIONS[actionIndex];
        if (action) {
          void runAction(action.key);
        }
      }
      return;
    }

    if (view.name === "logs") {
      if (name === "escape") {
        setView({ name: "detail", slug: view.slug });
      }
      if (name === "up" || name === "k") {
        setLogOffset((offset) => offset + 1);
      }
      if (name === "down" || name === "j") {
        setLogOffset((offset) => Math.max(0, offset - 1));
      }
      return;
    }

    if (view.name === "doctor" || view.name === "settings") {
      if (name === "escape") {
        setView({ name: "games" });
      }
      if (view.name === "settings" && name === "a") {
        void toggleAnonymous(config, setConfig, setStatus);
      }
    }
  });

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1, gap: 1 }}>
      <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <text fg="#61afef">steam-mac</text>
        <text fg="#5c6370">{rows.length} game(s)</text>
      </box>

      <box style={{ flexDirection: "column", flexGrow: 1 }}>
        {view.name === "games" ? <GameList rows={rows} selected={listIndex} /> : null}
        {view.name === "detail" && current ? (
          <GameDetail row={rows[listIndex]!} fields={fields} actions={ACTIONS} selected={actionIndex} />
        ) : null}
        {view.name === "add" ? (
          <AddWizard
            busy={busy}
            onCancel={() => setView({ name: "games" })}
            onSubmit={(values) => void submitAdd(values, setBusy, setStatus, setView, reload)}
          />
        ) : null}
        {view.name === "doctor" ? <DoctorView title="Doctor" checks={checks} /> : null}
        {view.name === "logs" ? (
          <LogsView title="Game log" lines={logs} pageSize={Math.max(5, height - 8)} offset={logOffset} />
        ) : null}
        {view.name === "settings" && config ? <SettingsView config={config} /> : null}
      </box>

      <StatusBar message={status} busy={busy} hints={hintsFor(view)} />
    </box>
  );
}

async function submitAdd(
  values: AddValues,
  setBusy: (busy: boolean) => void,
  setStatus: (status: string) => void,
  setView: (view: View) => void,
  reload: () => Promise<void>,
): Promise<void> {
  if (!values.name && !values.appid) {
    setStatus("error: give a name or an appid");
    return;
  }
  setBusy(true);
  try {
    const result = await safeAction(() =>
      addGame({ name: values.name || undefined, appid: values.appid, depot: values.depot }),
    );
    setStatus(result.ok ? result.message : `error: ${result.message}`);
    if (result.ok) {
      await reload();
      setView({ name: "games" });
    }
  } finally {
    setBusy(false);
  }
}

async function toggleAnonymous(
  config: Config | null,
  setConfig: (config: Config) => void,
  setStatus: (status: string) => void,
): Promise<void> {
  if (!config) {
    return;
  }
  const next = await updateConfig({ steamcmd: { ...config.steamcmd, anonymous: !config.steamcmd.anonymous } });
  setConfig(next);
  setStatus(`steamcmd: ${next.steamcmd.anonymous ? "anonymous" : "account"} mode`);
}

function hintsFor(view: View): string {
  if (view.name === "games") {
    return "↑↓ move · enter open · a add · s settings · r refresh · q quit";
  }
  if (view.name === "detail") {
    return "↑↓ move · enter run action · esc back";
  }
  if (view.name === "logs") {
    return "↑↓ scroll · esc back";
  }
  if (view.name === "settings") {
    return "a toggle anonymous · esc back";
  }

  return "esc back";
}
