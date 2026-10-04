# Architecture

`steam-mac` is a single TypeScript program. A thin CLI (`src/cli.ts`) and an
OpenTUI interface (`src/tui/`) both call the same engine in `src/core/`. The
engine resolves a game from a runtime registry, downloads its Windows build
through Steam, and turns the Wine prefix into a native `.app`.

```
src/cli.ts ─┐
            ├─▶ src/core/lifecycle.ts ─┬─▶ depot.ts      (Steam depot download + import)
src/tui/  ──┘                          ├─▶ exe.ts        (executable detection after import)
                                       ├─▶ steamcmd.ts   (headless download)
                                       ├─▶ store.ts      (store metadata + artwork)
                                       ├─▶ catalog.ts    (known-game profile defaults)
                                       ├─▶ wine.ts       (runtime provisioning)
                                       ├─▶ icon.ts       (.icns from art, exe or a placeholder)
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

### Known games and executable detection

The Steam store does not expose the executable name or the save layout, so
`catalog.ts` holds that data per appid (currently Graveyard Keeper 2). `add`
merges a catalog entry under any explicit flag. For a game without an entry the
profile starts with `<slug>.exe`, and `import` runs `exe.ts` when that file is
missing: it picks the executable whose name matches the game, otherwise the
largest `.exe`, ignoring crash handlers and installers. The profile is rewritten
and the app bundle rebuilt, so opening the `.app` launches the real game.

## Steam integration

- `store.ts` talks to the public store API (no key, no login) to resolve a name
  to an appid, cache metadata, and build the artwork URL candidates. It also
  queries SteamGridDB with the `steamGridDbKey` API key for art the store
  dropped.
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
| `gptk-apple` | the Gcenx loader with Apple's DMG D3DMetal merged in | `bin/wine64` |
| `wine-devel` / `wine-staging` | a Gcenx Wine tarball in `~/.steam-mac/wine`, pinned by `wineVersion` | `bin/wine` |

GPTK carries D3DMetal for Direct3D but bundles Wine 7.7, whose memory manager
asserts on some 32-bit OpenGL games. The Gcenx builds are current; Homebrew's
Wine casks conflict with GPTK and are disabled by Gatekeeper, so `setup`
downloads the tarball directly.

GPTK's Wine reports a stale `wine-7.7 (Game Porting Toolkit 1.1)` string, so
`status`/`doctor` report the D3DMetal framework version instead
(`d3dMetalVersion` reads `lib/external/D3DMetal.framework`).

The opt-in `gptk-apple` runtime takes the newer D3DMetal from Apple's
"Evaluation environment for Windows games" DMG (behind an Apple ID) and merges
its `redist/lib` subset onto a cloned Gcenx loader under
`~/.steam-mac/wine/gptk-apple`. The DMG ships no macOS Wine loader and no full
Wine tree, so it is an overlay, not a runtime; Apple's Read Me says to replace
`lib/external` and `lib/wine` wholesale, which would delete the hundreds of
builtins the Gcenx loader carries, so `wine.ts` merges the subset instead. The
clone is an APFS copy-on-write clone, so it costs only the new D3DMetal.

**Known blocker (2026-10-03):** the overlay is not usable with the Gcenx
loader. The reloaded redist is D3DMetal 4.0, but the Gcenx app is Apple's Wine
7.7, and 4.0's `d3d11.dll` fails to initialise on it — `err:module:LdrInitializeThunk
"d3d11.dll" failed to initialize ... status c0000142`, so the game aborts before
any window. D3DMetal 4.0 needs the matching Apple Wine build, which Gcenx has
not shipped (latest cask is 3.0-3). Keep games on `gptk` until then; the overlay
remains available for when a compatible loader exists.

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

`icon.ts` tries the sources in order, stopping at the first that produces an
`.icns`, and builds `icon.png` plus `icon.icns` with `sips` and `iconutil`:

1. the vertical Steam library art (600x900) and the other store candidates;
2. SteamGridDB, square icons first then vertical grids;
3. the smaller Steam artwork (logos and capsules);
4. the icon embedded in the game executable, with `wrestool` / `icotool`
   (Homebrew `icoutils`);
5. a placeholder generated from the game's initial with a built-in bitmap font.

Missing art is not fatal: a game without an icon still gets a working bundle.

## Provisioning

`addGame` writes the profile, then calls `provisionGame`, which runs `setup`
(Rosetta, Wine, SteamCMD, prefix, icon, bundle), `download` (SteamCMD, or the
guided Steam console) and `import` in order. When the depot id is missing the
game stays registered and the pipeline stops with a message. When the icon is
still a placeholder or missing, it is re-provisioned after the import so the
executable icon can replace it; a good icon found before the download is left
alone. `setup` installs SteamCMD, so the tool never needs it installed by hand.

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

Destructive actions never let the engine prompt on stdin: `actions.ts` marks
them, `_App.tsx` asks in-app and runs them with `yes: true`. `theme.ts` owns the
palette, so screens do not hard-code colours (ADR 005).

## Tests

`tests/unit` covers profiles (including the legacy `game.conf` parser), the
registry, depot discovery and update states, SteamCMD output parsing, the store
client, and the `.app` bundle (built against a fake Wine runtime). `tests/tui`
renders the interface in memory. `cli.test.ts` drives the real CLI process
against a temporary `SM_HOME`.
