# steam-mac

Wrap **any Windows-only Steam game** into a real macOS `.app` on Apple Silicon,
through Wine and Apple's D3DMetal (Game Porting Toolkit). One repo, one runtime
registry, one CLI, one terminal interface.

This is the unified successor to the per-game wrapper repos
(`steam-mac-core`, `broken-sword-directors-cut`, `graveyard-keeper-2`,
`office-management-101`, `the-cosmic-wheel-sisterhood`). Instead of one git repo
per game, it keeps every game in a registry under `~/.steam-mac/games/<slug>/`.

> Unofficial fan tool. **You must own the game on Steam.** This repo contains no
> game files.

## What it does

- Registers a game from the Steam store (name or appid), caching its metadata.
- Provisions a new game in one step: `add` runs setup, then download and import.
- Knows Graveyard Keeper 2 out of the box (the built-in catalog fills the
  executable, save folders and window-mode registry key); for any other game it
  detects the executable after `import` and rebuilds the bundle.
- Fetches the app icon automatically: Steam library art, then SteamGridDB, the
  smaller Steam artwork, the icon embedded in the `.exe`, and finally a
  generated placeholder.
- Installs **SteamCMD** itself as part of `setup`, so depot downloads need no
  manual tooling.
- Provisions the Wine runtime: Game Porting Toolkit by default, a pinned Gcenx
  `wine-devel` / `wine-staging` build when GPTK's Wine 7.7 cannot run the game.
  An opt-in `gptk-apple` runtime overlays the newer D3DMetal from Apple's Game
  Porting Toolkit 4.0 DMG onto the Gcenx loader (only the D3DMetal layer; the
  redist's 4.0 bridge DLLs are skipped because they do not initialise on Wine
  7.7).
- Downloads the Windows depot with **SteamCMD**, falling back to the guided
  Steam-console flow when a login is missing.
- Imports the depot into a Wine prefix, tracks the depot manifest and reports
  whether an update is available.
- Builds a native `.app` that hosts the Wine loader itself, so the game gets a
  normal macOS app menu and a working **Cmd+Q**.
- Manages the full lifecycle: run, window mode, logs, saves, mods, backups,
  uninstall. Everything is idempotent and honours `--dry-run`.
- Ships an **OpenTUI** interface (`@opentui/react`) for all of the above.

## Requirements

- Apple Silicon Mac, macOS 14 (Sonoma) or newer
- Node.js 26.4 or newer (the OpenTUI interface needs `--experimental-ffi`)
- [Homebrew](https://brew.sh)
- A Steam account that owns the games you add

## Install

```sh
pnpm install
pnpm setup                # links the global `steam-mac` command
pnpm start                # opens the terminal interface from the checkout
```

## Quick start

```sh
# open the terminal interface
steam-mac

# or use the CLI: add resolves, sets up, downloads and imports in one step
steam-mac add "Graveyard Keeper 2" --depot 4358691
steam-mac run graveyard-keeper-2
```

For a game in the built-in catalog (currently Graveyard Keeper 2) `add` needs
nothing else. For any other game, pass `--exe Name.exe` when you know it, or let
`import` detect the executable in the game folder and rewrite the profile. The
TUI's add wizard has the same optional **Exe** field.

`download` uses SteamCMD. Anonymous downloads work for free games; for owned
games run `steam-mac login` once so SteamCMD remembers your account. If SteamCMD
cannot help, the command falls back to opening the Steam console and waits for
`download_depot` to finish.

## Commands

| Command | What it does |
|---|---|
| `list` | List registered games with size, update and app state |
| `add "<name>"` / `add --appid N` | Register a game and provision it (setup → download → import) |
| `remove <game>` | Uninstall and forget a game (`--purge` deletes the prefix) |
| `migrate <path>` | Import a legacy per-game repo into the registry |
| `config [key=value ...]` | Show or change machine-wide settings |
| `login` | Store a SteamCMD login for owned games |
| `setup <game>` | Runtime, prefix, icon, app bundle |
| `download <game>` | Fetch the Windows depot (`--manual` for the Steam console) |
| `import <game>` | Move a finished depot download into the prefix |
| `update <game>` | Check for and install an update (`--check` exits 3 if any) |
| `run <game>` | Launch the game |
| `windowed` / `fullscreen <game>` | Switch the Unity screen mode when configured |
| `app` / `icon <game>` | Rebuild the bundle / refresh the icon |
| `status` / `doctor <game>` | Install state / PASS-WARN-FAIL health checks |
| `logs` / `saves` / `mods <game>` | Tail the log, open the folders |
| `backup-saves <game>` | Copy saves to `~/Documents` |
| `steam-setup` / `steam <game>` | Optional Windows Steam inside the prefix |
| `uninstall <game>` | Remove the app bundle (`--purge` also deletes the prefix) |
| `tui` | Open the terminal interface |
| `version` / `help` | Version / this list |

### TUI keys

`up` / `down` move, `enter` opens or runs, `a` adds a game, `s` opens settings,
`r` refreshes, `?` shows the full keyboard reference, `q` quits. In a game view,
`esc` goes back and `enter` runs the selected action. While an action runs the
**Activity** panel streams the engine output line by line, and `esc` cancels it.
Destructive actions (`uninstall`) ask for confirmation in the interface, then
delete the app bundle and the Wine prefix and forget the game, so it leaves the
list.

## Layout

```
bin/steam-mac.mjs        launcher (adds --experimental-ffi for the TUI only)
src/cli.ts               command line entry point
src/core/                engine: profiles, registry, Steam, Wine, bundle, lifecycle
src/tui/                 OpenTUI interface (@opentui/react)
tests/unit/              node:test unit and integration tests
tests/tui/               render tests for the interface
docs/                    architecture, managing, troubleshooting, ADRs, plan
```

Everything the tool creates at runtime lives under `~/.steam-mac` (override with
`SM_HOME`):

```
~/.steam-mac/
  config.json            machine-wide settings
  games/<slug>/          game.json, manifest, assets/
  wine/                  pinned Gcenx builds
  steamcmd/              SteamCMD install and depot downloads
```

## Tests

```sh
pnpm typecheck      # tsc --noEmit
pnpm test           # node:test unit and integration tests
pnpm test:tui       # OpenTUI render test
pnpm check          # all of the above
```

## Docs

- [docs/architecture.md](docs/architecture.md) - how the engine is put together
- [docs/managing.md](docs/managing.md) - day-to-day lifecycle
- [docs/troubleshooting.md](docs/troubleshooting.md) - when something breaks
- [docs/plans/execution-plan.md](docs/plans/execution-plan.md) - the build plan

MIT licensed. Wine and GPTK packaging by [Gcenx](https://github.com/Gcenx).
