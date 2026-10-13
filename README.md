# decanter

Wrap **any Windows-only PC game (Steam, GOG or Epic)** into a real macOS
`.app` on Apple Silicon, through Wine and Apple's D3DMetal (Game Porting
Toolkit). One repo, one runtime registry, one CLI, one terminal interface.

`decanter` is the unified successor to the earlier per-game wrapper repos:
instead of one git repo per game, it keeps every game in a registry under
`~/.decanter/games/<slug>/`, and it speaks all three stores a Mac player
already owns games on.

- **Three stores, one pipeline.** **Steam** (SteamCMD depots), **GOG** (the
  Galaxy content system, DRM-free) and **Epic** (the BuildPatch manifest) all
  resolve to the same profile, the same Wine prefix and the same `.app`.
- **One catalog.** `c` lists every **game** the three stores own, one row per
  game; a game owned on more than one store is a single row and `enter` asks
  which store to install from.
- **Automatic provisioning.** `add` runs setup, download and import in one
  step, and fetches the icon from the store the game came from.
- **Offline where it can.** The Steam owned list and the whole catalog read the
  clients' own caches; GOG and Epic log in once, then work from the cache.
- **Full lifecycle.** run, window mode, logs, saves, mods, backups, uninstall,
  runtime upgrade and rollback, idempotent, and every step honors `--dry-run`.
- **OpenTUI interface** (`@opentui/react`) over the same engine as the CLI.

> Unofficial fan tool. **You must own each game on the store you download it
> from.** This repo contains no game files.

## Stores

| Store | Owned list | Download | Login |
|---|---|---|---|
| **Steam** | the client's local caches (no key), or the Web API when a key is set | SteamCMD depots, with a guided Steam-console fallback | `decanter login steam` |
| **GOG** | the GOG API (`embed.gog.com`) | the Galaxy content system (build → manifest → chunks), DRM-free | `decanter login gog` (OAuth, paste the redirect URL) |
| **Epic** | the launcher library API | Epic's BuildPatch manifest (binary manifest + hashed chunks) | `decanter login epic` (OAuth, paste the code) |

`list <store>` prints one store's full library. The catalog keeps only games, so
runtimes, dedicated servers, SDKs, DLC, soundtracks and demos stay out. Every
credential lives in `~/.decanter/config.json`, collected by `decanter init`; a
store with no credentials still answers from its cache, and the wizard is
required only to fetch.

## What it does

- Registers a game from **Steam, GOG or Epic** (name or id), caching its
  metadata for offline lookups.
- Provisions a new game in one step: `add` runs setup, then download and import.
- Knows a small built-in catalog out of the box (Graveyard Keeper 2 and Game Dev
  Studio on Steam, The Settlers II - 10th Anniversary on GOG); for any other
  game it detects the executable after `import` and rebuilds the bundle.
- Fetches the app icon automatically from the store the game came from: the
  Steam CDN (library art, then SteamGridDB, then the smaller artwork), the GOG
  image CDN for GOG games, or the Epic catalog images, then the icon embedded in
  the `.exe`, and finally a generated placeholder.
- Downloads the Windows build per store: **SteamCMD** depots for Steam (falling
  back to the guided Steam-console flow when a login is missing), the Galaxy
  content system for GOG, and the BuildPatch manifest for Epic.
- Installs **SteamCMD** itself as part of `setup`, so Steam depot downloads need
  no manual tooling.
- Provisions the Wine runtime: Game Porting Toolkit by default, a pinned Gcenx
  `wine-devel` / `wine-staging` build when GPTK's Wine 7.7 cannot run the game.
  An opt-in `gptk-apple` runtime overlays the newer D3DMetal from Apple's Game
  Porting Toolkit 4.0 DMG onto the Gcenx loader (only the D3DMetal layer; the
  redist's 4.0 bridge DLLs are skipped because they do not initialize on Wine
  7.7). For a Gcenx runtime on Apple Silicon, `setup` also installs the Rosetta
  far-return `wow64cpu.dll` fix that stops 32-bit games crashing in
  `wow64cpu.dll`.
- Reports the Wine + Direct3D stack a game uses (`Game Porting Toolkit (Apple) ·
  D3DMetal 4.0b2`, `Wine devel 11.18 · DX9 (native d3dx9)`), tries the newest
  runtime available, and rolls back to the previous runtime that worked.
- Imports the build into a Wine prefix, tracks the installed manifest and
  reports whether an update is available.
- Builds a native `.app` that hosts the Wine loader itself, so the game gets a
  normal macOS app menu and a working **Cmd+Q**.
- Manages the full lifecycle: run, window mode, logs, saves, mods, backups,
  uninstall.
- Ships an **OpenTUI** interface (`@opentui/react`) for all of the above.

## Requirements

- Apple Silicon Mac, macOS 14 (Sonoma) or newer
- Node.js 26.4 or newer (the OpenTUI interface needs `--experimental-ffi`)
- [Homebrew](https://brew.sh)
- An account on the store(s) you use; you must own the games you add

## Install

```sh
pnpm install
pnpm setup                # links the global `decanter` command
pnpm start                # opens the terminal interface from the checkout
```

On a machine with no credentials the first run opens the **setup wizard**
(CLI: `decanter init`). It collects every credential and writes it to
`~/.decanter/config.json`; no credential ships in this repository.

## Quick start

```sh
# configure the stores once
decanter init

# open the terminal interface
decanter

# or use the CLI: add resolves, sets up, downloads and imports in one step
decanter add "Graveyard Keeper 2" --depot 4358691        # Steam
decanter add --store gog --gog-id 1207659163             # GOG
decanter add --store epic --epic-app Boga                # Epic
decanter run graveyard-keeper-2
```

For a game in the built-in catalog `add` needs nothing else. For any other game,
pass `--exe Name.exe` when you know it, or let `import` detect the executable in
the game folder and rewrite the profile. The TUI's add wizard has the same
optional **Exe** field and a **Steam / GOG / Epic** store select.

`download` is store-specific. For Steam, anonymous downloads work for free
games; run `decanter login steam` once for owned games so SteamCMD remembers
your account, and if SteamCMD cannot help the command falls back to the Steam
console. For GOG and Epic, run `decanter login gog` / `decanter login epic`
once; the build is then fetched through the store's own content system.

## Commands

| Command | What it does |
|---|---|
| `init` | First-run wizard: collect every credential into `~/.decanter` |
| `list [store]` | List registered games, or a store's owned games (`steam`, `gog`, `epic`) |
| `add "<name>"` / `add --appid N` | Register a game and provision it (setup → download → import) |
| `remove <game>` | Uninstall and forget a game (`--purge` deletes the prefix) |
| `migrate <path>` | Import a legacy per-game repo into the registry |
| `edit <game>` | Open the profile in `$EDITOR` (default `open`) |
| `config [key=value ...]` | Show or change machine-wide settings |
| `login <store> [arg]` / `logout <store>` | Log in to / out of `steam`, `gog` or `epic` |
| `setup <game>` | Runtime, prefix, icon, app bundle |
| `download <game>` | Fetch the Windows build (`--manual` for the Steam console) |
| `import <game>` | Move a finished download into the prefix |
| `update <game>` | Check for and install an update (`--check` exits 3 if any) |
| `run <game>` | Launch the game |
| `quit <game>` | Stop the game's Wine processes (a Cmd+Q substitute) |
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

`list <store>` needs that store configured. Each store's owned list is read from
its **local cache first** (Steam's library folders and `appcache/appinfo.vdf`, or
the GOG and Epic cache `list` writes); the store API is the refresh and the
fallback (`--refresh`). `decanter init` configures every store in one pass and
stores the values in `~/.decanter/config.json`. The Steam Web API key is free at
[the Steam Web API key page](https://steamcommunity.com/dev/apikey), and the
profile's **Game details** must be **Public** for the API path.

Other flags: `--refresh` (`list`) fetches from the store instead of the cache,
`--manual` (`download`) skips SteamCMD for the Steam console, `--installer
<path>` (`import`) runs a GOG offline installer in the prefix, `--check`
(`update`) reports only and exits 3, `--no-open` (`saves` / `mods`) prints the
folder without opening it, `-n N` (`logs`) sets the line count, `--purge`
(`remove` / `uninstall`) deletes the Wine prefix, `--yes` / `-y` skips
confirmations, `--force` (`add` / `migrate` / `steam-setup`) overwrites, and
`--dry-run` prints what would happen without changing anything.

### TUI keys

`up` / `down` move, `enter` opens or runs, `a` adds a game, `c` opens the
catalog (only real games, one row per game across stores; `enter` installs and
asks which store when the game is owned on more than one), `s` opens settings,
`m` migrates a legacy repo in a Terminal, `r` refreshes, `?` shows the full
keyboard reference, `q` quits except while editing or adding a game. In a game view, `esc` goes back
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
src/core/                engine: profiles, registry, stores (Steam/GOG/Epic), Wine, bundle, lifecycle
src/tui/                 OpenTUI interface (@opentui/react)
tests/unit/              node:test unit and integration tests
tests/tui/               render tests for the interface
docs/                    architecture, managing, troubleshooting, ADRs, handoffs, plans
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

CI runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which is
`pnpm check`, on every pull request and every push to `main`.

## Docs

- [docs/architecture.md](docs/architecture.md) - how the engine is put together
- [docs/managing.md](docs/managing.md) - day-to-day lifecycle
- [docs/troubleshooting.md](docs/troubleshooting.md) - when something breaks
- [docs/plans/execution-plan.md](docs/plans/execution-plan.md) - the build plan
- [CONTRIBUTING.md](CONTRIBUTING.md) - set up, commit convention and pull requests
- [GOVERNANCE.md](GOVERNANCE.md) - who decides, and what funding does not buy
- [SECURITY.md](SECURITY.md) - how to report a vulnerability
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - the community standards
- [CHANGELOG.md](CHANGELOG.md) - what changed in each release

## Inspirations

- Ignacio Martin Vazquez

Wine and GPTK packaging by [Gcenx](https://github.com/Gcenx).

MIT licensed. Funded through [GitHub Sponsors](https://github.com/sponsors/pixu1980);
see [GOVERNANCE.md](GOVERNANCE.md) for what funding does not buy.
