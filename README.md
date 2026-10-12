# decanter

Wrap **any Windows-only Steam game** into a real macOS `.app` on Apple Silicon,
through Wine and Apple's D3DMetal (Game Porting Toolkit). One repo, one runtime
registry, one CLI, one terminal interface.

This is the unified successor to the per-game wrapper repos
(`steam-mac-core`, `broken-sword-directors-cut`, `graveyard-keeper-2`,
`office-management-101`, `the-cosmic-wheel-sisterhood`). Instead of one git repo
per game, it keeps every game in a registry under `~/.decanter/games/<slug>/`.

> Unofficial fan tool. **You must own the game on Steam.** This repo contains no
> game files.

## What it does

- Registers a game from the Steam store (name or appid), caching its metadata.
- Provisions a new game in one step: `add` runs setup, then download and import.
- Knows Graveyard Keeper 2 out of the box (the built-in catalog fills the
  executable, save folders and window-mode registry key); for any other game it
  detects the executable after `import` and rebuilds the bundle.
- Fetches the app icon automatically from the store the game came from: the
  Steam CDN (library art, then SteamGridDB, then the smaller artwork), the
  GOG image CDN for GOG games, or the Epic catalog images, then the icon
  embedded in the `.exe`, and finally a generated placeholder.
- Installs **SteamCMD** itself as part of `setup`, so depot downloads need no
  manual tooling.
- Provisions the Wine runtime: Game Porting Toolkit by default, a pinned Gcenx
  `wine-devel` / `wine-staging` build when GPTK's Wine 7.7 cannot run the game.
  An opt-in `gptk-apple` runtime overlays the newer D3DMetal from Apple's Game
  Porting Toolkit 4.0 DMG onto the Gcenx loader (only the D3DMetal layer; the
  redist's 4.0 bridge DLLs are skipped because they do not initialise on Wine
  7.7).
- Reports the Wine + Direct3D stack a game uses (`Game Porting Toolkit (Apple) ·
  D3DMetal 4.0b2`, `Wine devel 11.18 · DX9 (native d3dx9)`), tries the newest
  runtime available, and rolls back to the previous runtime that worked.
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
pnpm setup                # links the global `decanter` command
pnpm start                # opens the terminal interface from the checkout
```

## Quick start

```sh
# open the terminal interface
decanter

# or use the CLI: add resolves, sets up, downloads and imports in one step
decanter add "Graveyard Keeper 2" --depot 4358691
decanter run graveyard-keeper-2
```

For a game in the built-in catalog (currently Graveyard Keeper 2) `add` needs
nothing else. For any other game, pass `--exe Name.exe` when you know it, or let
`import` detect the executable in the game folder and rewrite the profile. The
TUI's add wizard has the same optional **Exe** field.

`download` uses SteamCMD. Anonymous downloads work for free games; for owned
games run `decanter login steam` once so SteamCMD remembers your account. If SteamCMD
cannot help, the command falls back to opening the Steam console and waits for
`download_depot` to finish.

## Commands

| Command | What it does |
|---|---|
| `list [store]` | List registered games, or a store's owned games (`steam`, `gog`, `epic`) || `add "<name>"` / `add --appid N` | Register a game and provision it (setup → download → import) |
| `remove <game>` | Uninstall and forget a game (`--purge` deletes the prefix) |
| `migrate <path>` | Import a legacy per-game repo into the registry |
| `config [key=value ...]` | Show or change machine-wide settings |
| `login <store> [arg]` / `logout <store>` | Log in to / out of `steam`, `gog` or `epic` |
| `setup <game>` | Runtime, prefix, icon, app bundle |
| `download <game>` | Fetch the Windows depot (`--manual` for the Steam console) |
| `import <game>` | Move a finished depot download into the prefix |
| `update <game>` | Check for and install an update (`--check` exits 3 if any) |
| `run <game>` | Launch the game |
| `windowed` / `fullscreen <game>` | Switch the Unity screen mode when configured |
| `app` / `icon <game>` | Rebuild the bundle / refresh the icon |
| `status` / `doctor <game>` | Install state / PASS-WARN-FAIL health checks |
| `runtime <game>` | Show the Wine + Direct3D runtime in use and its history |
| `runtime-upgrade <game>` | Try the newest Wine build / D3DMetal overlay |
| `runtime-rollback <game>` | Return to the previous recorded runtime |
| `logs` / `saves` / `mods <game>` | Tail the log, open the folders |
| `backup-saves <game>` | Copy saves to `~/.decanter/backups` |
| `steam-setup` / `steam <game>` | Optional Windows Steam inside the prefix |
| `uninstall <game>` | Remove the app bundle (`--purge` also deletes the prefix) |
| (no command) | Open the terminal interface |
| `version` / `help` | Version / this list |

`list <store>` needs the store to be readable. GOG and Epic use the account you
logged in with. `list steam` reads the owned list from the Steam client's own
caches (the library folders and `appcache/appinfo.vdf`) with no key and no
network; when a **Steam Web API key** is set
([steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey), free) it
uses the API instead, and the profile's **Game details** must be **Public** for
that.

### TUI keys

`up` / `down` move, `enter` opens or runs, `a` adds a game, `c` opens the
catalog (only real games, one row per game across stores; `enter` installs and
asks which store when the game is owned on more than one), `s` opens settings,
`m` migrates a legacy repo in a Terminal, `r` refreshes, `?` shows the full
keyboard reference, `q` quits from any screen. In a game view, `esc` goes back
and `enter` runs the selected action; the list mirrors the per-game CLI,
including the flag variants (`download --manual`, `update --check`) and both
destructive steps (`uninstall` keeps the data, `remove` purges the prefix and
forgets the game). While an action runs the **Activity** panel streams the engine
output line by line, and `esc` cancels it. Destructive actions ask for
confirmation in the interface. In **settings** every row is editable: `up` /
`down` move, `enter` edits a path or number, cycles the wine runtime, toggles the
anonymous account, or runs a login/logout. The SteamCMD login opens a Terminal;
the GOG and Epic logins open the browser and ask for the code in-app (paste the
GOG **redirect URL**, or the `code`; GOG rejects a localhost redirect, so the
redirect URL is the reliable way). The add wizard picks the store with a
**Steam / GOG / Epic** select and shows the store-specific fields.

## Layout

```
bin/decanter.mjs        launcher (adds --experimental-ffi for the TUI only)
src/cli.ts               command line entry point
src/core/                engine: profiles, registry, Steam, Wine, bundle, lifecycle
src/tui/                 OpenTUI interface (@opentui/react)
tests/unit/              node:test unit and integration tests
tests/tui/               render tests for the interface
docs/                    architecture, managing, troubleshooting, ADRs, plan
```

Everything the tool creates at runtime lives under `~/.decanter` (override with
`DECANTER_HOME`):

```
~/.decanter/
  config.json            machine-wide settings
  bin/                   runtime helpers (Cmd+Q hotkey)
  games/<slug>/          game.json, manifest, assets/
  games/<slug>/prefix/   the game's Wine prefix
  games/<slug>/saves/    the game's saves (a link when they live in the prefix)
  wine/                  pinned Gcenx builds
  steamcmd/              SteamCMD install and depot downloads
  gog/                   GOG tokens
  epic/                  Epic tokens
  logs/                  per-game loader output
  temp/                  downloads and scratch space
  backups/               save backups
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
