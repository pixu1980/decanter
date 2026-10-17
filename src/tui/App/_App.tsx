// The application shell: view routing, keyboard handling and status line.
//
// Screens stay presentational; this file owns state and calls the lifecycle
// commands through `safeAction`, so console output never breaks the frame.
// Destructive actions confirm in-app, because the engine's own prompt reads
// stdin while the renderer owns the terminal.
//
// docs: docs/architecture.md

import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addGame } from "../../core/add.ts";
import {
  CREDENTIAL_FIELDS,
  type Config,
  loadConfig,
  missingCredentials,
  requireEpic,
  requireGog,
  updateConfig,
} from "../../core/config.ts";
import { buildCatalog, catalogAddArgs, matchesEntry, type CatalogEntry, type CatalogGame } from "../../core/library.ts";
import { cancel, exec } from "../../core/exec.ts";
import { exists, remove } from "../../core/fsx.ts";
import { resolveGamePaths } from "../../core/game.ts";
import {
  cmdApp,
  cmdBackupSaves,
  cmdDownload,
  cmdFullscreen,
  cmdIcon,
  cmdImport,
  cmdMods,
  cmdQuit,
  cmdRun,
  cmdRuntimeRollback,
  cmdRuntimeUpgrade,
  cmdSaves,
  cmdSetup,
  cmdSteam,
  cmdSteamSetup,
  cmdUninstall,
  cmdUpdate,
  cmdWindowed,
  collectDoctor,
  collectRuntime,
  collectStatus,
  readLogTail,
  type DoctorCheck,
  type StatusField,
} from "../../core/lifecycle.ts";
import { log, type LogLevel } from "../../core/log.ts";
import { gogAuthPath, epicAuthPath, gameProfilePath } from "../../core/paths.ts";
import { extractGogCode, gogExchangeCode, gogLoginUrl, loadGogTokens } from "../../core/gog.ts";
import { epicExchangeCode, epicLoginUrl, extractEpicCode, loadEpicTokens } from "../../core/epic.ts";
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
import { CatalogView } from "../components/CatalogView/index.ts";
import { SettingsView, settingsRows, type LoginState } from "../components/SettingsView/index.ts";
import { StorePicker } from "../components/StorePicker/index.ts";
import { InstallView } from "../components/InstallView/index.ts";
import { StatusBar } from "../components/StatusBar/index.ts";
import { theme } from "../theme.ts";
import { SetupView } from "../components/SetupView/index.ts";
import { wizardRows } from "../../core/wizard.ts";
import { Activity, type ActivityLine } from "../components/Activity/index.ts";
import { refreshGames, safeAction, type GameRow } from "../helpers/index.ts";

type View =
  | { name: "games" }
  | { name: "detail"; slug: string }
  | { name: "add" }
  | { name: "doctor"; slug: string }
  | { name: "runtime"; slug: string }
  | { name: "logs"; slug: string }
  | { name: "catalog" }
  | { name: "install" }
  | { name: "setup" }
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
  const [logins, setLogins] = useState<LoginState>({ steam: false, gog: false, epic: false });
  const [codeLogin, setCodeLogin] = useState<"gog" | "epic" | null>(null);
  const [codeValue, setCodeValue] = useState("");
  const [settingsIndex, setSettingsIndex] = useState(0);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [catalogRows, setCatalogRows] = useState<CatalogGame[]>([]);
  const [catalogIndex, setCatalogIndex] = useState(0);
  const [catalogFilter, setCatalogFilter] = useState("");
  const [storePick, setStorePick] = useState<{ game: CatalogGame; index: number } | null>(null);
  const [install, setInstall] = useState<{ title: string; store: string; id: string } | null>(null);
  const setupChecked = useRef(false);

  const reload = useCallback(async () => {
    const nextConfig = await loadConfig();
    setConfig(nextConfig);
    // First run with nothing configured: open the wizard once, in a real terminal.
    if (!setupChecked.current && process.stdin.isTTY) {
      setupChecked.current = true;
      if (missingCredentials(nextConfig).length === CREDENTIAL_FIELDS.length) {
        setView({ name: "setup" });
      }
    }
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
    const epic = (await loadEpicTokens()) !== null;
    setLogins({ steam, gog, epic });
  }, []);

  useEffect(() => {
    if (view.name === "settings") {
      void refreshLogins();
    }
  }, [view.name, refreshLogins]);

  const submitCode = useCallback(async () => {
    const raw = codeValue.trim();
    if (!raw) {
      return;
    }
    const store = codeLogin;
    setBusy(true);
    try {
      const config = await loadConfig();
      if (store === "epic") {
        await epicExchangeCode(requireEpic(config), extractEpicCode(raw));
      } else {
        await gogExchangeCode(requireGog(config), extractGogCode(raw));
      }
      setCodeValue("");
      setCodeLogin(null);
      await refreshLogins();
      setStatus(`${store === "epic" ? "Epic" : "GOG"}: login stored`);
    } catch (error) {
      setStatus(`error: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [codeValue, codeLogin, refreshLogins]);

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
        await codeStartLogin("gog", setStatus, setCodeLogin);
      } else if (row.key === "gog.logout") {
        await gogLogout(setStatus, refreshLogins);
      } else if (row.key === "epic.login") {
        await codeStartLogin("epic", setStatus, setCodeLogin);
      } else if (row.key === "epic.logout") {
        await epicLogout(setStatus, refreshLogins);
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

  const filteredCatalog = catalogRows.filter((game) => {
    const term = catalogFilter.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return (
      game.title.toLowerCase().includes(term) ||
      game.entries.some((entry) => entry.store.includes(term) || entry.id.toLowerCase().includes(term))
    );
  });

  // Rows that fit between the catalog header and the status line; the activity
  // panel takes its own space when it is on screen.
  const catalogPageSize = Math.max(3, height - (busy || activity.length > 0 ? 22 : 13));
  const activityShown = (busy || activity.length > 0) && view.name !== "install";
  const activityPage = 6;
  // What the activity panel takes when it is on screen: its tail, or its one-row
  // empty state, plus the two border rows and the gap above it.
  const activityHeight = activityShown ? Math.max(1, Math.min(activityPage, activity.length)) + 3 : 0;
  // The game list fills the column the catalog uses, without the filter box: the
  // shell keeps 8 rows for the padding, the header, the status line and the panel
  // border, and the activity panel takes its own height plus a gap.
  const listPageSize = Math.max(1, height - 8 - activityHeight);
  // The shell keeps rows for the padding, the header, the status line and the
  // gaps; the activity panel adds its own rows when it is on screen.
  const detailReserved = 9 + (activityShown ? activityPage + 2 : 0);

  const openCatalog = useCallback(async () => {
    setBusy(true);
    setCatalogFilter("");
    setCatalogIndex(0);
    try {
      setCatalogRows(await buildCatalog());
      setView({ name: "catalog" });
      setStatus("catalog loaded — type to filter, enter to install");
    } finally {
      setBusy(false);
    }
  }, []);

  const installEntry = useCallback(
    async (entry: CatalogEntry) => {
      setInstall({ title: entry.title, store: entry.store, id: entry.id });
      setActivity([]);
      setView({ name: "install" });
      setBusy(true);
      try {
        const result = await safeAction(() => addGame(catalogAddArgs(entry)), appendActivity);
        setStatus(result.ok ? result.message : `error: ${result.message}`);
        const next = await reload();
        setCatalogRows(await buildCatalog());
        if (result.ok) {
          const added = next.find((row) => matchesEntry(row.profile, entry));
          setListIndex(added ? next.indexOf(added) : 0);
          setView({ name: "games" });
        }
      } finally {
        setBusy(false);
      }
    },
    [appendActivity, reload],
  );

  const installCatalog = useCallback(async () => {
    const game = filteredCatalog[catalogIndex];
    if (!game) {
      return;
    }
    if (game.installed) {
      const row = rows.find((candidate) => game.entries.some((entry) => matchesEntry(candidate.profile, entry)));
      if (row) {
        openDetail(row.profile.slug);
      }
      return;
    }
    if (game.entries.length > 1) {
      setStorePick({ game, index: 0 });
      return;
    }
    const entry = game.entries[0];
    if (entry) {
      await installEntry(entry);
    }
  }, [filteredCatalog, catalogIndex, rows, openDetail, installEntry]);

  const executeAction = useCallback(
    async (action: string) => {
      if (!current) {
        return;
      }
      setBusy(true);
      try {
        if (action === "run") {
          const result = await safeAction(() => cmdRun(current.slug), appendActivity);
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
          windowed: () => cmdWindowed(current.slug),
          fullscreen: () => cmdFullscreen(current.slug),
          download: () => cmdDownload(current.slug),
          "download-manual": () => cmdDownload(current.slug, { manual: true }),
          import: () => cmdImport(current.slug),
          "import-installer": async () => {
            await exec(
              "osascript",
              [
                "-e",
                `tell application "Terminal" to do script "read \\"installer path: \\" p; decanter import ${current.slug} --installer \\"$p\\""`,
              ],
              { allowFailure: true },
            );
            log(`import installer for ${current.slug} opened in Terminal`);
          },
          update: () => cmdUpdate(current.slug),
          "update-check": async () => {
            await cmdUpdate(current.slug, { check: true });
            // `--check` sets exit code 3 for scripts; the interface must not inherit it.
            process.exitCode = 0;
          },
          app: () => cmdApp(current.slug),
          icon: () => cmdIcon(current.slug),
          "runtime-upgrade": () => cmdRuntimeUpgrade(current.slug),
          "runtime-rollback": () => cmdRuntimeRollback(current.slug),
          "steam-setup": () => cmdSteamSetup(current.slug),
          steam: async () => {
            await exec(
              "osascript",
              ["-e", `tell application "Terminal" to do script "decanter steam ${current.slug}"`],
              {
                allowFailure: true,
              },
            );
            log(`Windows Steam for ${current.slug} opened in Terminal`);
          },
          saves: () => cmdSaves(current.slug, { open: true }),
          mods: () => cmdMods(current.slug, { open: true }),
          backup: () => cmdBackupSaves(current.slug),
          edit: () => exec("open", [gameProfilePath(current.slug)], { allowFailure: true }),
          uninstall: () => cmdUninstall(current.slug, { yes: true }),
          remove: async () => {
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

    if (storePick) {
      if (name === "up" || name === "k") {
        setStorePick((pick) => (pick ? { ...pick, index: Math.max(0, pick.index - 1) } : pick));
      }
      if (name === "down" || name === "j") {
        setStorePick((pick) =>
          pick ? { ...pick, index: Math.min(pick.game.entries.length - 1, pick.index + 1) } : pick,
        );
      }
      if (name === "return") {
        const entry = storePick.game.entries[storePick.index];
        setStorePick(null);
        if (entry) {
          void installEntry(entry);
        }
      }
      if (name === "escape") {
        setStorePick(null);
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
    if (name === "q" && !editing && codeLogin === null && view.name !== "add") {
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
      if (name === "c") {
        void openCatalog();
      }
      if (name === "s") {
        setView({ name: "settings" });
      }
      if (name === "m") {
        void exec("osascript", ["-e", 'tell application "Terminal" to do script "decanter migrate"'], {
          allowFailure: true,
        });
        setStatus("migrate: opened in Terminal");
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

    if (view.name === "install") {
      if (name === "escape") {
        setView({ name: "catalog" });
      }
      return;
    }

    if (view.name === "setup") {
      if (name === "return" || name === "i") {
        void exec("osascript", ["-e", 'tell application "Terminal" to do script "decanter init"'], {
          allowFailure: true,
        });
        setStatus("setup: the wizard is open in a Terminal — press r when it is done");
      }
      if (name === "r") {
        void reload();
        setStatus("setup: re-checked");
      }
      if (name === "escape") {
        setView({ name: "games" });
      }
      return;
    }

    if (view.name === "catalog") {
      if (name === "escape") {
        setView({ name: "games" });
        return;
      }
      // Only the arrow keys navigate: `j`/`k` stay available to the filter input.
      if (name === "up") {
        setCatalogIndex((index) => Math.max(0, index - 1));
      }
      if (name === "down") {
        setCatalogIndex((index) => Math.min(Math.max(0, filteredCatalog.length - 1), index + 1));
      }
      if (name === "return") {
        void installCatalog();
      }
      return;
    }

    if (view.name === "doctor" || view.name === "settings") {
      if (name === "escape") {
        if (editing) {
          setEditing(null);
        } else if (codeLogin !== null) {
          setCodeLogin(null);
        } else {
          setView({ name: "games" });
        }
        return;
      }
      if (view.name === "settings") {
        if (codeLogin !== null || editing) {
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
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1, gap: 1, backgroundColor: theme.panel }}>
      <Header breadcrumb={breadcrumbFor(view, current)} right={`${rows.length} game(s) · ? help`} />

      {pending || helpOpen || storePick ? (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          {pending ? (
            <ConfirmDialog {...confirmCopy(pending, current?.name ?? "")} />
          ) : storePick ? (
            <StorePicker title={storePick.game.title} entries={storePick.game.entries} index={storePick.index} />
          ) : (
            <HelpOverlay />
          )}
        </box>
      ) : (
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          {view.name === "games" ? <GameList rows={rows} selected={listIndex} pageSize={listPageSize} /> : null}
          {view.name === "setup" ? <SetupView rows={config ? wizardRows(config) : []} /> : null}
          {view.name === "detail" && current ? (
            <GameDetail
              row={rows[listIndex]!}
              fields={fields}
              actions={ACTIONS}
              selected={actionIndex}
              reserved={detailReserved}
            />
          ) : null}
          {view.name === "catalog" ? (
            <CatalogView
              games={filteredCatalog}
              index={catalogIndex}
              filter={catalogFilter}
              onFilter={(value) => {
                setCatalogFilter(value);
                setCatalogIndex(0);
              }}
              busy={busy}
              pageSize={catalogPageSize}
            />
          ) : null}
          {view.name === "install" && install ? (
            <InstallView
              title={install.title}
              store={install.store}
              id={install.id}
              lines={activity}
              busy={busy}
              pageSize={Math.max(3, height - 16)}
            />
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
              codeOpen={codeLogin !== null}
              codeStore={codeLogin ?? "gog"}
              code={codeValue}
              onCode={setCodeValue}
              onCodeSubmit={() => void submitCode()}
              onEditValue={(value) => setEditing((current) => (current ? { ...current, value } : current))}
              onEditSubmit={() => void saveEdit()}
            />
          ) : null}
        </box>
      )}

      {activityShown ? <Activity lines={activity} busy={busy} pageSize={activityPage} /> : null}

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
        addGame({
          name: values.name || undefined,
          store: values.store,
          appid: values.appid,
          depot: values.depot,
          slug: values.slug,
          gogId: values.gogId,
          runtime: values.runtime as WineRuntime | undefined,
        }),
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
  await exec("osascript", ["-e", 'tell application "Terminal" to do script "decanter login steam"'], {
    allowFailure: true,
  });
  setStatus("SteamCMD: login opened in Terminal — reopen settings when done");
}

async function steamLogout(setStatus: (status: string) => void, refresh: () => Promise<void>): Promise<void> {
  await steamcmdLogout();
  await refresh();
  setStatus("steamcmd: logged out");
}

async function codeStartLogin(
  store: "gog" | "epic",
  setStatus: (status: string) => void,
  setOpen: (store: "gog" | "epic") => void,
): Promise<void> {
  const config = await loadConfig();
  await exec("open", [store === "epic" ? epicLoginUrl(requireEpic(config)) : gogLoginUrl(requireGog(config))], {
    allowFailure: true,
  });
  setOpen(store);
  setStatus(
    store === "epic"
      ? "Epic: log in in the browser, then paste the authorization code below"
      : "GOG: log in in the browser, then paste the redirect URL below",
  );
}

async function gogLogout(setStatus: (status: string) => void, refresh: () => Promise<void>): Promise<void> {
  await remove(gogAuthPath());
  await refresh();
  setStatus("gog: logged out");
}

async function epicLogout(setStatus: (status: string) => void, refresh: () => Promise<void>): Promise<void> {
  await remove(epicAuthPath());
  await refresh();
  setStatus("Epic: logged out");
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
  if (view.name === "catalog") {
    return "Catalog";
  }
  if (view.name === "install") {
    return "Install";
  }
  if (view.name === "setup") {
    return "Setup";
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
      title: "Uninstall app",
      message: `Remove the app bundle for ${name}?`,
      detail: "The Wine prefix, saves and mods are kept; the game stays in the list.",
    };
  }
  if (action === "remove") {
    return {
      title: "Remove game",
      message: `Remove ${name} and delete its data?`,
      detail: "The app bundle, the Wine prefix, saves and mods are deleted, and the game leaves the list.",
    };
  }

  return { title: "Confirm", message: `Run ${action} for ${name}?` };
}

function hintsFor(view: View): string {
  if (view.name === "games") {
    return "↑↓ move · enter open · a add · c catalog · s settings · m migrate · r refresh · ? help · q quit";
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
  if (view.name === "install") {
    return "esc cancel · q quit";
  }
  if (view.name === "setup") {
    return "enter open the wizard · r re-check · esc skip";
  }
  if (view.name === "settings") {
    return "a toggle anonymous · esc back";
  }

  return "esc back";
}
