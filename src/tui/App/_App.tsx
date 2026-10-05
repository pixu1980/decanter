// The application shell: view routing, keyboard handling and status line.
//
// Screens stay presentational; this file owns state and calls the lifecycle
// commands through `safeAction`, so console output never breaks the frame.
// Destructive actions confirm in-app, because the engine's own prompt reads
// stdin while the renderer owns the terminal.
//
// docs: docs/architecture.md

import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { addGame } from "../../core/add.ts";
import { type Config, loadConfig, updateConfig } from "../../core/config.ts";
import { cancel, exec } from "../../core/exec.ts";
import { exists, remove } from "../../core/fsx.ts";
import { resolveGamePaths } from "../../core/game.ts";
import {
  cmdApp,
  cmdBackupSaves,
  cmdDownload,
  cmdIcon,
  cmdImport,
  cmdQuit,
  cmdRuntimeRollback,
  cmdRuntimeUpgrade,
  cmdSaves,
  cmdSetup,
  cmdUninstall,
  cmdUpdate,
  collectDoctor,
  collectRuntime,
  collectStatus,
  readLogTail,
  type DoctorCheck,
  type StatusField,
} from "../../core/lifecycle.ts";
import { log, type LogLevel } from "../../core/log.ts";
import { gogAuthPath } from "../../core/paths.ts";
import { extractGogCode, gogExchangeCode, gogLoginUrl, loadGogTokens } from "../../core/gog.ts";
import { steamcmdHasLogin, steamcmdLogout } from "../../core/steamcmd.ts";
import type { RuntimeSnapshot, WineRuntime } from "../../core/profile.ts";
import { removeGameRecord } from "../../core/registry.ts";
import { ACTIONS, DESTRUCTIVE } from "../actions.ts";
import { AddWizard, type AddValues } from "../components/AddWizard/index.ts";
import { ConfirmDialog } from "../components/ConfirmDialog/index.ts";
import { DoctorView } from "../components/DoctorView/index.ts";
import { GameDetail } from "../components/GameDetail/index.ts";
import { GameList } from "../components/GameList/index.ts";
import { Header } from "../components/Header/index.ts";
import { HelpOverlay } from "../components/HelpOverlay/index.ts";
import { LogsView } from "../components/LogsView/index.ts";
import { RuntimeView } from "../components/RuntimeView/index.ts";
import { SettingsView, settingsRows, type LoginState } from "../components/SettingsView/index.ts";
import { StatusBar } from "../components/StatusBar/index.ts";
import { Activity, type ActivityLine } from "../components/Activity/index.ts";
import { refreshGames, safeAction, type GameRow } from "../helpers/index.ts";

type View =
  | { name: "games" }
  | { name: "detail"; slug: string }
  | { name: "add" }
  | { name: "doctor"; slug: string }
  | { name: "runtime"; slug: string }
  | { name: "logs"; slug: string }
  | { name: "settings" };

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
  const [runtimeFields, setRuntimeFields] = useState<StatusField[]>([]);
  const [runtimeHistory, setRuntimeHistory] = useState<RuntimeSnapshot[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [logOffset, setLogOffset] = useState(0);
  const [status, setStatus] = useState("ready");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityLine[]>([]);
  const [logins, setLogins] = useState<LoginState>({ steam: false, gog: false });
  const [gogCode, setGogCode] = useState("");
  const [gogCodeOpen, setGogCodeOpen] = useState(false);
  const [settingsIndex, setSettingsIndex] = useState(0);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);

  const reload = useCallback(async () => {
    setConfig(await loadConfig());
    const next = await refreshGames();
    setRows(next);
    return next;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const appendActivity = useCallback(
    (line: string, level: LogLevel) => setActivity((prev) => [...prev.slice(-199), { line, level }]),
    [],
  );

  const refreshLogins = useCallback(async () => {
    const steam = await steamcmdHasLogin();
    const gog = (await loadGogTokens()) !== null;
    setLogins({ steam, gog });
  }, []);

  useEffect(() => {
    if (view.name === "settings") {
      void refreshLogins();
    }
  }, [view.name, refreshLogins]);

  const submitGogCode = useCallback(async () => {
    const raw = gogCode.trim();
    if (!raw) {
      return;
    }
    setBusy(true);
    try {
      await gogExchangeCode(extractGogCode(raw));
      setGogCode("");
      setGogCodeOpen(false);
      await refreshLogins();
      setStatus("GOG: login stored");
    } catch (error) {
      setStatus(`error: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [gogCode, refreshLogins]);

  const settings = config ? settingsRows(config, logins) : [];

  const saveEdit = useCallback(async () => {
    if (!editing) {
      return;
    }
    const value = editing.key === "logLines" ? Number(editing.value) : editing.value;
    setConfig(await updateConfig({ [editing.key]: value } as never));
    setEditing(null);
  }, [editing]);

  const activateSetting = useCallback(
    async (row: { key: string; kind: string; value: string; options?: string[] } | undefined) => {
      if (!row || !config) {
        return;
      }
      if (row.kind === "text" || row.kind === "number") {
        setEditing({ key: row.key, value: row.value });
        return;
      }
      if (row.kind === "toggle") {
        await toggleAnonymous(config, setConfig, setStatus);
        return;
      }
      if (row.kind === "select") {
        const options = row.options ?? [];
        const next = options[(options.indexOf(row.value) + 1) % options.length] ?? row.value;
        setConfig(await updateConfig({ wineRuntime: next as never }));
        setStatus(`${row.key}: ${next}`);
        return;
      }
      if (row.key === "steamcmd.login") {
        await steamLogin(setStatus);
      } else if (row.key === "steamcmd.logout") {
        await steamLogout(setStatus, refreshLogins);
      } else if (row.key === "gog.login") {
        await gogStartLogin(setStatus, setGogCodeOpen);
      } else if (row.key === "gog.logout") {
        await gogLogout(setStatus, refreshLogins);
      }
    },
    [config, refreshLogins],
  );

  const current = rows[listIndex]?.profile ?? null;

  const openDetail = useCallback((slug: string) => {
    setActionIndex(0);
    setFields([]);
    setView({ name: "detail", slug });
    void collectStatus(slug)
      .then((report) => setFields(report.fields))
      .catch(() => setFields([]));
  }, []);

  const executeAction = useCallback(
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
          const result = await safeAction(() => exec("open", [paths.app]), appendActivity);
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
        if (action === "runtime") {
          const report = await collectRuntime(current.slug);
          setRuntimeFields(report.fields);
          setRuntimeHistory(report.history);
          setView({ name: "runtime", slug: current.slug });
          setStatus("runtime loaded");
          return;
        }
        const commands: Record<string, () => Promise<unknown>> = {
          setup: () => cmdSetup(current.slug),
          quit: () => cmdQuit(current.slug),
          download: () => cmdDownload(current.slug),
          import: () => cmdImport(current.slug),
          update: () => cmdUpdate(current.slug),
          app: () => cmdApp(current.slug),
          icon: () => cmdIcon(current.slug),
          "runtime-upgrade": () => cmdRuntimeUpgrade(current.slug),
          "runtime-rollback": () => cmdRuntimeRollback(current.slug),
          saves: () => cmdSaves(current.slug, { open: true }),
          backup: () => cmdBackupSaves(current.slug),
          uninstall: async () => {
            await cmdUninstall(current.slug, { yes: true, purge: true });
            await removeGameRecord(current.slug);
            log(`removed ${current.slug} from the registry`);
          },
        };
        const command = commands[action];
        if (!command) {
          return;
        }
        const result = await safeAction(command, appendActivity);
        setStatus(result.ok ? result.message : `error: ${result.message}`);
        const next = await reload();
        if (view.name === "detail") {
          if (next.some((row) => row.profile.slug === current.slug)) {
            const report = await collectStatus(current.slug);
            setFields(report.fields);
          } else {
            setListIndex(0);
            setView({ name: "games" });
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [config, current, reload, view.name, appendActivity],
  );

  const runAction = useCallback(
    (action: string) => {
      if (DESTRUCTIVE.has(action)) {
        setPending(action);
        return;
      }
      void executeAction(action);
    },
    [executeAction],
  );

  useKeyboard((key) => {
    const name = key.name;

    if (helpOpen) {
      if (name === "escape" || name === "?" || name === "q") {
        setHelpOpen(false);
      }
      return;
    }

    if (pending) {
      if (name === "y" || name === "return") {
        setPending(null);
        void executeAction(pending);
      } else if (name === "n" || name === "escape") {
        setPending(null);
      }
      return;
    }

    if (busy) {
      if (name === "escape") {
        cancel();
        setStatus("cancelling…");
      }
      return;
    }

    // q quits from any screen, unless an input owns the key.
    if (name === "q" && !editing && !gogCodeOpen && view.name !== "add") {
      renderer.destroy();
      return;
    }

    if (view.name === "add") {
      return;
    }

    if (name === "?") {
      setHelpOpen(true);
      return;
    }

    if (view.name === "games") {
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
          runAction(action.key);
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

    if (view.name === "runtime") {
      if (name === "escape") {
        setView({ name: "detail", slug: view.slug });
      }
      return;
    }

    if (view.name === "doctor" || view.name === "settings") {
      if (name === "escape") {
        if (editing) {
          setEditing(null);
        } else if (gogCodeOpen) {
          setGogCodeOpen(false);
        } else {
          setView({ name: "games" });
        }
        return;
      }
      if (view.name === "settings") {
        if (gogCodeOpen || editing) {
          return;
        }
        if (name === "up" || name === "k") {
          setSettingsIndex((index) => Math.max(0, index - 1));
        }
        if (name === "down" || name === "j") {
          setSettingsIndex((index) => Math.min(settings.length - 1, index + 1));
        }
        if (name === "return") {
          void activateSetting(settings[settingsIndex]);
        }
      }
    }
  });

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1, gap: 1 }}>
      <Header breadcrumb={breadcrumbFor(view, current)} right={`${rows.length} game(s) · ? help`} />

      {pending || helpOpen ? (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          {pending ? <ConfirmDialog {...confirmCopy(pending, current?.name ?? "")} /> : <HelpOverlay />}
        </box>
      ) : (
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          {view.name === "games" ? <GameList rows={rows} selected={listIndex} /> : null}
          {view.name === "detail" && current ? (
            <GameDetail row={rows[listIndex]!} fields={fields} actions={ACTIONS} selected={actionIndex} />
          ) : null}
          {view.name === "add" ? (
            <AddWizard
              busy={busy}
              onCancel={() => setView({ name: "games" })}
              onSubmit={(values) => void submitAdd(values, setBusy, setStatus, setView, reload, appendActivity)}
            />
          ) : null}
          {view.name === "doctor" ? <DoctorView title="Doctor" checks={checks} /> : null}
          {view.name === "runtime" ? (
            <RuntimeView title={`Runtime — ${current?.name ?? ""}`} fields={runtimeFields} history={runtimeHistory} />
          ) : null}
          {view.name === "logs" ? (
            <LogsView title="Game log" lines={logs} pageSize={Math.max(5, height - 8)} offset={logOffset} />
          ) : null}
          {view.name === "settings" && config ? (
            <SettingsView
              rows={settings}
              index={settingsIndex}
              editing={editing}
              gogCodeOpen={gogCodeOpen}
              gogCode={gogCode}
              onGogCode={setGogCode}
              onGogSubmit={() => void submitGogCode()}
              onEditValue={(value) => setEditing((current) => (current ? { ...current, value } : current))}
              onEditSubmit={() => void saveEdit()}
            />
          ) : null}
        </box>
      )}

      {busy || activity.length > 0 ? <Activity lines={activity} busy={busy} /> : null}

      <StatusBar message={status} busy={busy} hints={hintsFor(view)} />
    </box>
  );
}

async function submitAdd(
  values: AddValues,
  setBusy: (busy: boolean) => void,
  setStatus: (status: string) => void,
  setView: (view: View) => void,
  reload: () => Promise<unknown>,
  appendActivity: (line: string, level: LogLevel) => void,
): Promise<void> {
  if (!values.name && !values.appid) {
    setStatus("error: give a name or an appid");
    return;
  }
  setBusy(true);
  try {
    const result = await safeAction(
      () =>
        addGame({ name: values.name || undefined, store: values.store, appid: values.appid, depot: values.depot, exe: values.exe, runtime: values.runtime as WineRuntime | undefined }),
      appendActivity,
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

async function steamLogin(setStatus: (status: string) => void): Promise<void> {
  await exec("osascript", ["-e", 'tell application "Terminal" to do script "steam-mac login"'], {
    allowFailure: true,
  });
  setStatus("SteamCMD: login opened in Terminal — reopen settings when done");
}

async function steamLogout(setStatus: (status: string) => void, refresh: () => Promise<void>): Promise<void> {
  await steamcmdLogout();
  await refresh();
  setStatus("steamcmd: logged out");
}

async function gogStartLogin(setStatus: (status: string) => void, setOpen: (open: boolean) => void): Promise<void> {
  await exec("open", [gogLoginUrl()], { allowFailure: true });
  setOpen(true);
  setStatus("GOG: log in in the browser, then paste the redirect URL below");
}

async function gogLogout(setStatus: (status: string) => void, refresh: () => Promise<void>): Promise<void> {
  await remove(gogAuthPath());
  await refresh();
  setStatus("gog: logged out");
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

function breadcrumbFor(view: View, current: GameRow["profile"] | null): string {
  if (view.name === "detail") {
    return current?.name ?? "Game";
  }
  if (view.name === "add") {
    return "Add a game";
  }
  if (view.name === "doctor") {
    return "Doctor";
  }
  if (view.name === "runtime") {
    return "Runtime";
  }
  if (view.name === "logs") {
    return "Logs";
  }
  if (view.name === "settings") {
    return "Settings";
  }

  return "Games";
}

function confirmCopy(action: string, name: string): { title: string; message: string; detail?: string } {
  if (action === "uninstall") {
    return {
      title: "Uninstall",
      message: `Remove the app bundle for ${name}?`,
      detail: "The Wine prefix, saves and mods are deleted, and the game leaves the list.",
    };
  }

  return { title: "Confirm", message: `Run ${action} for ${name}?` };
}

function hintsFor(view: View): string {
  if (view.name === "games") {
    return "↑↓ move · enter open · a add · s settings · r refresh · ? help · q quit";
  }
  if (view.name === "detail") {
    return "↑↓ move · enter run action · esc back · ? help";
  }
  if (view.name === "logs") {
    return "↑↓ scroll · esc back";
  }
  if (view.name === "runtime") {
    return "esc back · q quit";
  }
  if (view.name === "settings") {
    return "a toggle anonymous · esc back";
  }

  return "esc back";
}
