// steam-mac — command line entry point.
//
// `steam-mac` with no command opens the OpenTUI interface when a terminal is
// attached, otherwise it prints help. Every game command takes a slug (a
// prefix or the exact name also works).
//
// docs: README.md, docs/architecture.md

import { addGame } from "./core/add.ts";
import { flagBool, flagNumber, flagString, parseArgs, type ParsedArgs } from "./core/args.ts";
import { loadConfig, updateConfig } from "./core/config.ts";
import { gameInstalled, updateStatus } from "./core/depot.ts";
import { exec, setDryRun } from "./core/exec.ts";
import { exists } from "./core/fsx.ts";
import {
  cmdApp,
  cmdBackupSaves,
  cmdDoctor,
  cmdDownload,
  cmdFullscreen,
  cmdIcon,
  cmdImport,
  cmdLogs,
  cmdMods,
  cmdQuit,
  cmdRun,
  cmdSaves,
  cmdSetup,
  cmdStatus,
  cmdSteam,
  cmdSteamSetup,
  cmdUninstall,
  cmdUpdate,
  cmdWindowed,
  humanSize,
  loadContext,
} from "./core/lifecycle.ts";
import { CliError, die, log } from "./core/log.ts";
import { migrateRepo } from "./core/migrate.ts";
import { gameDir } from "./core/paths.ts";
import type { WineRuntime } from "./core/profile.ts";
import { listGames, removeGameRecord, resolveGame } from "./core/registry.ts";
import { detectSteamAccount, steamcmdLogin } from "./core/steamcmd.ts";

const VERSION = "0.1.0";

/** Commands that take a game slug as their first positional. */
const SLUG_COMMANDS = new Set([
  "setup",
  "download",
  "import",
  "update",
  "run",
  "quit",
  "windowed",
  "fullscreen",
  "status",
  "doctor",
  "app",
  "icon",
  "logs",
  "saves",
  "mods",
  "backup-saves",
  "steam-setup",
  "steam",
  "uninstall",
  "remove",
  "rm",
  "edit",
]);

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (flagBool(args.flags, "dry-run")) {
    setDryRun(true);
  }
  if (args.command === "version" || flagBool(args.flags, "version")) {
    process.stdout.write(`steam-mac ${VERSION}\n`);
    return;
  }
  if (args.command === "help" || flagBool(args.flags, "help")) {
    printHelp();
    return;
  }

  if (args.command === "" || args.command === "tui" || args.command === "ui") {
    const explicit = args.command !== "";
    if (explicit || process.stdout.isTTY) {
      const { runTui } = await import("./tui/run.tsx");
      await runTui();
      return;
    }
    printHelp();
    return;
  }

  if (args.command === "list" || args.command === "ls") {
    await printList();
    return;
  }

  if (args.command === "add") {
    await cmdAdd(args);
    return;
  }

  if (args.command === "migrate") {
    const path = args.positionals[0];
    if (!path) {
      die("usage: steam-mac migrate <repo-path> [--slug S] [--force]");
    }
    await migrateRepo(path, {
      slug: flagString(args.flags, "slug"),
      force: flagBool(args.flags, "force"),
    });
    return;
  }

  if (args.command === "login") {
    const config = await loadConfig();
    const username =
      args.positionals[0] ??
      config.steamcmd.username ??
      (await detectSteamAccount(config.steamRoot)) ??
      "";
    if (!username) {
      die("usage: steam-mac login <steam-username>");
    }
    await updateConfig({ steamcmd: { anonymous: false, username } });
    await steamcmdLogin({ anonymous: false, username });
    return;
  }

  if (args.command === "config") {
    await cmdConfig(args);
    return;
  }

  if (SLUG_COMMANDS.has(args.command)) {
    await cmdGame(args);
    return;
  }

  die(`unknown command: ${args.command} (see: steam-mac help)`);
}

async function cmdGame(args: ParsedArgs): Promise<void> {
  const query = args.positionals[0];
  if (!query) {
    die(`usage: steam-mac ${args.command} <game> — see: steam-mac list`);
  }
  const profile = await resolveGame(query);
  const slug = profile.slug;

  switch (args.command) {
    case "setup":
      return cmdSetup(slug);
    case "download":
      return cmdDownload(slug, { manual: flagBool(args.flags, "manual") });
    case "import":
      return cmdImport(slug);
    case "update":
      return cmdUpdate(slug, { check: flagBool(args.flags, "check") });
    case "run":
      return cmdRun(slug);
    case "quit":
      return cmdQuit(slug);
    case "windowed":
      return cmdWindowed(slug);
    case "fullscreen":
      return cmdFullscreen(slug);
    case "status":
      return cmdStatus(slug);
    case "doctor": {
      const ok = await cmdDoctor(slug);
      if (!ok) {
        process.exitCode = 1;
      }
      return;
    }
    case "app":
      return cmdApp(slug);
    case "icon":
      return cmdIcon(slug);
    case "logs":
      return cmdLogs(slug, flagNumber(args.flags, "n") ?? 80);
    case "saves": {
      const dir = await cmdSaves(slug, { open: !flagBool(args.flags, "no-open") });
      log(`saves folder: ${dir}`);
      return;
    }
    case "mods": {
      const dir = await cmdMods(slug, { open: !flagBool(args.flags, "no-open") });
      log(`mods folder: ${dir}`);
      return;
    }
    case "backup-saves":
      return cmdBackupSaves(slug);
    case "steam-setup":
      return cmdSteamSetup(slug, { force: flagBool(args.flags, "force") });
    case "steam":
      return cmdSteam(slug);
    case "uninstall":
      return cmdUninstall(slug, { purge: flagBool(args.flags, "purge"), yes: flagBool(args.flags, "yes") });
    case "remove":
    case "rm": {
      await cmdUninstall(slug, { purge: flagBool(args.flags, "purge"), yes: flagBool(args.flags, "yes") });
      await removeGameRecord(slug);
      log(`removed ${slug} from the registry`);
      return;
    }
    case "edit": {
      const editor = process.env.EDITOR ?? "open";
      const { gameProfilePath } = await import("./core/paths.ts");
      await exec(editor, [gameProfilePath(slug)], { stdio: "inherit", allowFailure: true });
      return;
    }
  }
}

async function cmdAdd(args: ParsedArgs): Promise<void> {
  const name = args.positionals[0];
  const appid = flagNumber(args.flags, "appid");
  if (!name && !appid) {
    die('usage: steam-mac add "<game name>" [--appid N] [--depot N]');
  }
  await addGame({
    name,
    appid,
    depot: flagNumber(args.flags, "depot"),
    slug: flagString(args.flags, "slug"),
    exe: flagString(args.flags, "exe"),
    runtime: flagString(args.flags, "runtime") as WineRuntime | undefined,
    force: flagBool(args.flags, "force"),
  });
}

async function cmdConfig(args: ParsedArgs): Promise<void> {
  if (args.positionals.length === 0) {
    process.stdout.write(`${JSON.stringify(await loadConfig(), null, 2)}\n`);
    return;
  }
  const patch: Record<string, unknown> = {};
  for (const pair of args.positionals) {
    const [key, value] = pair.split("=", 2) as [string, string | undefined];
    if (!key || value === undefined) {
      die("usage: steam-mac config key=value ...");
    }
    if (key.startsWith("steamcmd.")) {
      const nested = (patch.steamcmd ?? {}) as Record<string, unknown>;
      nested[key.slice("steamcmd.".length)] = value === "true" ? true : value === "false" ? false : value;
      patch.steamcmd = nested;
    } else {
      patch[key] = value;
    }
  }
  const next = await updateConfig(patch as never);
  process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
}

async function printList(): Promise<void> {
  const games = await listGames();
  if (games.length === 0) {
    log('no games yet — add one with: steam-mac add "<game name>"');
    return;
  }
  const rows: Array<[string, string, string, string, string]> = [];
  for (const game of games) {
    const ctx = await loadContext(game.slug);
    const imported = await gameInstalled(ctx.profile, ctx.paths);
    const status = await updateStatus(ctx.profile, ctx.paths);
    rows.push([
      game.slug,
      `${game.appid}/${game.depot || "?"}`,
      imported ? humanSize(await sizeOf(gameDir(game.slug))) : "—",
      statusLabel(status.state),
      exists(ctx.paths.app) ? "yes" : "no",
    ]);
  }
  const widths = [0, 1, 2, 3, 4].map((i) => Math.max(header()[i]!.length, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ");
  process.stdout.write(`${line([...header()])}\n`);
  for (const row of rows) {
    process.stdout.write(`${line([...row])}\n`);
  }
}

function header(): readonly string[] {
  return ["SLUG", "APP/DEPOT", "SIZE", "UPDATE", "APP"];
}

function statusLabel(state: string): string {
  if (state === "available") {
    return "available";
  }
  if (state === "waiting") {
    return "waiting";
  }
  if (state === "up-to-date") {
    return "current";
  }

  return "unknown";
}

async function sizeOf(dir: string): Promise<number> {
  if (!exists(dir)) {
    return 0;
  }
  const result = await exec("du", ["-sk", dir], { allowFailure: true });
  const kb = Number.parseInt(result.stdout.trim().split(/\s+/)[0] ?? "0", 10);
  return Number.isFinite(kb) ? kb * 1024 : 0;
}

function printHelp(): void {
  process.stdout.write(`steam-mac ${VERSION} — wrap any Windows-only Steam game into a macOS .app

usage: steam-mac [command] [game] [options]      (no command opens the TUI)

registry:
  list, ls              list registered games
  add "<name>"          add a game from the Steam store (--appid N --depot N --slug S)
  remove <game>         uninstall and forget a game (--purge --yes)
  migrate <path>        import a legacy per-game repo (--slug S --force)
  config [k=v ...]      show or change machine-wide settings
  login [user]          store a SteamCMD login (defaults to the native Steam account)

lifecycle:
  setup <game>          Rosetta, Wine runtime, prefix, icon, app bundle
  download <game>       fetch the Windows depot (SteamCMD, or --manual console)
  import <game>         move a finished depot download into the prefix
  update <game>         check for and install an update (--check exits 3 if any)
  run <game>            launch the game
  quit <game>           stop the game's Wine processes (Cmd+Q substitute)
  windowed <game>       switch to a native macOS window
  fullscreen <game>     switch back to borderless fullscreen
  app <game>            (re)build the .app bundle
  icon <game>           fetch (or refresh) the game icon
  status <game>         show the install state
  doctor <game>         PASS/WARN/FAIL checks (exit 1 on failure)
  logs <game>           tail the game log (-n N)
  saves <game>          open the saves folder
  mods <game>           open the mods folder
  backup-saves <game>   copy saves to ~/Documents
  steam-setup <game>    install Windows Steam inside the prefix
  steam <game>          launch Windows Steam inside the prefix
  uninstall <game>      remove the app bundle (--purge deletes the prefix)

interface:
  tui, ui               open the OpenTUI interface
  version               print the version
  help                  this message

options:
  --dry-run             print what would happen without changing anything
  --yes, -y             skip confirmation prompts
  --check               update: report only; exit 3 when an update is available
  --manual              download: skip SteamCMD, use the Steam console
  --purge               remove/uninstall: also delete the Wine prefix
  --force               add/migrate/steam-setup: overwrite

docs: README.md, docs/architecture.md, docs/managing.md
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof CliError) {
    process.stderr.write(`steam-mac: ${error.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`steam-mac: unexpected error: ${(error as Error)?.stack ?? String(error)}\n`);
  process.exit(1);
});
