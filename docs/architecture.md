# Architecture

`steam-mac` is a single TypeScript program. A thin CLI (`src/cli.ts`) and an
OpenTUI interface (`src/tui/`) both call the same engine in `src/core/`. The
engine resolves a game from a runtime registry, downloads its Windows build
through Steam, and turns the Wine prefix into a native `.app`.

```
src/cli.ts ─┐
            ├─▶ src/core/lifecycle.ts ─┬─▶ depot.ts      (Steam depot download + import)
src/tui/  ──┘                          ├─▶ steamcmd.ts   (headless download)
                                       ├─▶ store.ts      (store metadata + artwork)
                                       ├─▶ wine.ts       (runtime provisioning)
                                       ├─▶ icon.ts       (.icns from art or exe)
                                       ├─▶ bundle.ts     (the .app)
                                       └─▶ registry.ts   (games under ~/.steam-mac)
```

## Runtime registry

There is no per-game repo. `steam-mac add` and `steam-mac migrate` write a
profile to `~/.steam-mac/games/<slug>/game.json`, and copy the icon into that
folder's `assets/`. The rest of the tool reads only the registry.

`SM_HOME` overrides the root, which is how the tests keep the real machine
untouched.

## The profile contract (`game.json`)

Required to do anything useful:

| Key | Meaning |
|---|---|
| `name` / `slug` | display name and folder id |
| `appid` / `depot` | Steam app and depot ids |
| `exe` | main Windows executable inside the install dir |
| `installSubdir` | directory under `drive_c` that holds the game |

Commonly set: `dataSubdir` (saves, mods, log), `logName`, `modsSubdir`,
`savePatterns`, `versionPattern`, `wineRuntime`, `wineVersion`, `icon`,
`minMacos`, `meta` (store artwork), `paths` (per-game path overrides).

Window mode (Unity games): `window.enabled`, `window.screenModeKey`,
`window.regKey`, `window.settingsValue`, `window.unityModeValue`.

Hooks: `hooks.postImport` (a shell snippet run inside the prefix after
`import`) and `hooks.doctorExtra` (extra doctor checks that call `sm_check`).

Every path can also be overridden at runtime through the game's environment
prefix derived from the slug (`GK2_PREFIX`, `GK2_APP`, `GK2_WINE_APP`,
`GK2_STEAM_ROOT`, and so on).

## Steam integration

- `store.ts` talks to the public store API (no key, no login) to resolve a name
  to an appid, cache metadata, and build the artwork URL candidates.
- `steamcmd.ts` installs SteamCMD into `~/.steam-mac/steamcmd` and runs
  `+@sSteamCmdForcePlatformType windows +download_depot <appid> <depot>`. The
  platform override is what makes a macOS SteamCMD fetch the Windows build.
- `depot.ts` knows every folder a depot can land in (native Steam, the Steam
  app bundle, SteamCMD), imports the finished download into the prefix with
  `rsync --remove-source-files`, and records the depot manifest so `update` can
  tell whether the install is stale.
- The guided fallback opens `steam://open/console`, tells the user to run
  `download_depot`, and watches the depot folder until it stops growing.

## Wine runtimes

`wine.ts` resolves `wineRuntime`:

| Value | Source | Loader |
|---|---|---|
| `gptk` (default) | the Gcenx Game Porting Toolkit cask | `bin/wine64` |
| `wine-devel` / `wine-staging` | a Gcenx Wine tarball in `~/.steam-mac/wine`, pinned by `wineVersion` | `bin/wine` |

GPTK carries D3DMetal for Direct3D but bundles Wine 7.7, whose memory manager
asserts on some 32-bit OpenGL games. The Gcenx builds are current; Homebrew's
Wine casks conflict with GPTK and are disabled by Gatekeeper, so `setup`
downloads the tarball directly.

## The app bundle and Cmd+Q

macOS attributes a process to the `.app` whose `Contents/MacOS` holds the
running executable. GPTK's own bundle sets `LSUIElement` (an accessory app with
no menu bar and no Cmd+Q). `bundle.ts` therefore copies the tiny launchers
(`wine64`, `wine64-preloader`, `wineserver`) into `Contents/MacOS` and symlinks
the heavy `lib`/`share` directories, so Wine adopts our `Info.plist` and the
game gets a normal app menu and a working Cmd+Q.

The generated `launch` script embeds the prefix and game directory and execs
the loader directly, so the bundle needs no Node runtime at play time.

## Icons

`icon.ts` downloads the vertical Steam library art (600x900), squares it and
builds `icon.png` plus `icon.icns` with `sips` and `iconutil`. When the store
has no art it extracts the icon embedded in the game executable with
`wrestool` / `icotool` (Homebrew `icoutils`). Missing art is not fatal.

## Safety

- Every external command goes through `exec`, the single place that honours
  `--dry-run`, so a dry run never touches disk.
- Registry writes and removals honour dry-run too (`fsx.ts`).
- `die` throws a `CliError`; `cli.ts` is the only place that turns it into an
  exit code, so the engine never calls `process.exit`.
- Destructive commands confirm first unless `--yes`.
- `doctor` exits non-zero when a critical check fails, so it is scriptable.

## The interface

`src/tui` is an OpenTUI (`@opentui/react`) app. `_App.tsx` owns view routing,
keyboard handling and the status line; the screens are presentational. Actions
call the same lifecycle functions as the CLI through `safeAction`, which
captures `process.stdout`/`stderr` so engine logging never corrupts the frame.

## Tests

`tests/unit` covers profiles (including the legacy `game.conf` parser), the
registry, depot discovery and update states, SteamCMD output parsing, the store
client, and the `.app` bundle (built against a fake Wine runtime). `tests/tui`
renders the interface in memory. `cli.test.ts` drives the real CLI process
against a temporary `SM_HOME`.
