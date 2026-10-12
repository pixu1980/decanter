# Architecture

`decanter` is a single TypeScript program. A thin CLI (`src/cli.ts`) and an
OpenTUI interface (`src/tui/`) both call the same engine in `src/core/`. The
engine resolves a game from a runtime registry, downloads its Windows build
through Steam, GOG or Epic, and turns the Wine prefix into a native `.app`.

```
src/cli.ts ─┐
            ├─▶ src/core/lifecycle.ts ─┬─▶ stores.ts     (the Steam/GOG/Epic provider registry)
src/tui/  ──┘                          ├─▶ depot.ts      (Steam depot download + import)
                                       ├─▶ steamcmd.ts   (headless Steam download)
                                       ├─▶ gog.ts        (GOG auth + Galaxy content system)
                                       ├─▶ epic.ts       (Epic auth + BuildPatch manifest)
                                       ├─▶ exe.ts        (executable detection after import)
                                       ├─▶ store.ts      (Steam store metadata + artwork)
                                       ├─▶ catalog.ts    (known-game profile defaults)
                                       ├─▶ library.ts    (the cross-store catalog)
                                       ├─▶ wine.ts       (runtime provisioning)
                                       ├─▶ wow64.ts      (Rosetta far-return wow64cpu fix)
                                       ├─▶ icon.ts       (.icns from art, exe or a placeholder)
                                       ├─▶ bundle.ts     (the .app)
                                       └─▶ registry.ts   (games under ~/.decanter)
```

## Stores

`profile.store` is `steam`, `gog` or `epic`. `src/core/stores.ts` is the single
place that describes them: each `StoreProvider` reports the id used for lookups,
whether the profile is configured enough to download, the id's human name, the
launch arguments a title needs and its icon artwork. The download protocol
genuinely differs (SteamCMD depots, the Galaxy content system, Epic's BuildPatch
manifest), so the download, import and add steps are small per-store dispatch
tables in `lifecycle.ts` and `add.ts` rather than one interface every store must
satisfy; adding a store is a new provider plus one entry per table.

Every store's credentials live in `config.json` under `credentials`; none is in
the source. `decanter init` (CLI) and the TUI Setup screen write them through the
same field list. The cache answers `list` and the catalog without a credential;
the credential gates the fetch only (ADR 018).

## Runtime registry

There is no per-game repo. `decanter add` and `decanter migrate` write a
profile to `~/.decanter/games/<slug>/game.json`, and copy the icon into that
folder's `assets/`. The rest of the tool reads only the registry.

`DECANTER_HOME` overrides the root, which is how the tests keep the real machine
untouched.

Everything under the root is laid out so a game carries its own data:

```
~/.decanter/
  config.json
  games/<slug>/game.json      the profile
  games/<slug>/manifest       installed depot manifest id
  games/<slug>/assets/        icon.png, icon.icns
  games/<slug>/prefix/        the game's Wine prefix
  games/<slug>/saves/         the game's saves
  wine/ steamcmd/ gog/ logs/ temp/ backups/ bin/
```

`resolveGamePaths` points the prefix at `games/<slug>/prefix` and `savesDir` at
`games/<slug>/saves`; when the profile sets `dataSubdir` the game keeps saving
inside the prefix and `saves` is a symlink to that folder, so `decanter saves`
and `decanter backup-saves` always work on the canonical path.

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

A store does not always expose the executable name or the save layout, so
`catalog.ts` holds that data per store and id (currently Graveyard Keeper 2 and
Game Dev Studio on Steam, The Settlers II - 10th Anniversary on GOG). `add`
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
- `steamcmd.ts` installs SteamCMD into `~/.decanter/steamcmd` and runs
  `+@sSteamCmdForcePlatformType windows +download_depot <appid> <depot>`. The
  platform override is what makes a macOS SteamCMD fetch the Windows build.
- `depot.ts` knows every folder a depot can land in (native Steam, the Steam
  app bundle, SteamCMD), imports the finished download into the prefix with
  `rsync --remove-source-files`, and records the depot manifest so `update` can
  tell whether the install is stale.
- The guided fallback opens `steam://open/console`, tells the user to run
  `download_depot`, and watches the depot folder until it stops growing.

## GOG integration

`gog.ts` mirrors the GOG client: OAuth2 with the public Galaxy client (browser
plus a pasted redirect URL, tokens under `~/.decanter/gog/`), the owned list and
the product (with its image map) from the GOG API, and a Windows build resolved
through the Galaxy content system. The build is a zlib meta document listing
depots, a zlib depot manifest listing files, directories and links, and content
chunks fetched with a per-build secure link, inflated and verified by MD5. GOG
builds are DRM-free, so the game runs with no launcher and `run` needs no extra
arguments. `add --store gog`, `download`, `import` and `icon` branch on the
store.

## Epic integration

`epic.ts` mirrors the GOG client: OAuth with the public launcher client (browser
plus a pasted authorization code, tokens under the decanter home), entitlements
and the catalog for lookup and artwork, and a build resolved through the
launcher host. Content is a binary BuildPatch manifest, the parser is a
faithful port of legendary's format (`0x44BEC00C` magic, an optionally zlib
body, then the metadata, chunk data list and file manifest list), and the
chunks are fetched from the build CDN bases, inflated and verified by SHA-1.
`add --store epic`, `download`, `import` and `icon` branch on the store. `run`
fetches an exchange code and passes the launcher arguments legendary computes
(`-AUTH_TYPE=exchangecode`, `-epicapp`, `-epicusername`, `-epicsandboxid`, ...)
through `open --args`, so authenticated titles start; the EOS overlay for
multiplayer is still the next step. See
[ADR 017](adr/017-epic.md).

## Wine runtimes

`wine.ts` resolves `wineRuntime`:

| Value | Source | Loader |
|---|---|---|
| `gptk` (default) | the Gcenx Game Porting Toolkit cask | `bin/wine64` |
| `gptk-apple` | the Gcenx loader with Apple's DMG D3DMetal merged in | `bin/wine64` |
| `wine-devel` / `wine-staging` | a Gcenx Wine tarball in `~/.decanter/wine`, pinned by `wineVersion` | `bin/wine` |

GPTK carries D3DMetal for Direct3D but bundles Wine 7.7, whose memory manager
asserts on some 32-bit OpenGL games. The Gcenx builds are current; Homebrew's
Wine casks conflict with GPTK and are disabled by Gatekeeper, so `setup`
downloads the tarball directly.

GPTK's Wine reports a stale `wine-7.7 (Game Porting Toolkit 1.1)` string, so
`status`/`doctor` report the D3DMetal framework version instead
(`d3dMetalVersion` reads `lib/external/D3DMetal.framework`).

`runtimeDetails` turns that into the one-line stack a user reads: the runtime
label, the reported Wine build and the Direct3D backend (`D3DMetal x`, `DX9
(native d3dx9)` when the profile carries the `d3dx9` winetricks verb, otherwise
`WineD3D`). `status`, `doctor` and the TUI runtime panel all read it.

Every launch records a `RuntimeSnapshot` (runtime, pinned Wine version,
D3DMetal version, timestamp) in the profile's `runtimeHistory`, deduplicated and
bounded. `runtime-upgrade` advances `wine-devel` / `wine-staging` to the newest
Gcenx GitHub release, re-overlays the newer D3DMetal for `gptk-apple`, or
switches `gptk` to that overlay (falling back to `brew upgrade --cask`) and
rebuilds the app bundle. When the newer runtime misbehaves, `runtime-rollback`
restores the most recent history entry that differs from the current runtime.

The opt-in `gptk-apple` runtime takes the newer D3DMetal from Apple's
"Evaluation environment for Windows games" DMG (behind an Apple ID) and overlays
it onto a cloned Gcenx loader under `~/.decanter/wine/gptk-apple`. The DMG
ships no macOS Wine loader and no full Wine tree, so it is an overlay, not a
runtime. The clone is an APFS copy-on-write clone, so it costs only the new
D3DMetal.

Only the DMG's `redist/lib/external` is overlaid: the D3DMetal framework plus
`libd3dshared.dylib`. The redist also ships `wine/x86_64-unix` and
`wine/x86_64-windows` bridge DLLs (d3d10/11/12, dxgi, nvapi64, nvngx), but those
4.0 bridges do not initialize on Apple's frozen Wine 7.7 (`LdrInitializeThunk
"d3d11.dll" failed to initialize ... status c0000142`), so the loader keeps its
own bridge DLLs and `ensureWine` deliberately skips the redist `wine` folder.
Verified with D3DMetal 4.0b2: Graveyard Keeper 2 boots and renders through the
4.0 framework (`Renderer: AMD Compatibility Mode`).

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

`stores.ts` gives each store its own artwork candidates (`StoreProvider.art`),
and `icon.ts` tries them in order, stopping at the first that produces an
`.icns`, then builds `icon.png` plus `icon.icns` with `sips` and `iconutil`:

1. **Steam**, the vertical Steam library art (600x900), then SteamGridDB
   (square icons first, then vertical grids), then the smaller Steam artwork
   (logos and capsules);
2. **GOG**, the product artwork (`icon`, `logo2x`, `logo`, `background`) from
   the cached `meta.gogImages` map, made absolute (`//host/...` → `https://host/...`);
3. **Epic**, the catalog images from the cached `meta.epicImages` map;
4. the icon embedded in the game executable, with `wrestool` / `icotool`
   (Homebrew `icoutils`);
5. a placeholder generated from the game's initial with a built-in bitmap font.

Missing art is not fatal: a game without an icon still gets a working bundle.
Each store's `art` prunes the files another store's run may have left behind (an
appid-0 SteamGridDB lookup once returned an unrelated image), and `decanter icon`
rebuilds the bundle so the new icon actually reaches the app.

## Provisioning

`addGame` writes the profile, then calls `provisionGame`, which runs `setup`
(Rosetta, Wine, the wow64 fix, prefix, SteamCMD, icon, bundle), `download` (the
store's content system) and `import` in order. When a required id is missing the
game stays registered and the pipeline stops with a message. When the icon is
still a placeholder or missing, it is re-provisioned after the import so the
executable icon can replace it; a good icon found before the download is left
alone. `setup` installs SteamCMD, so Steam downloads never need it installed by
hand.

## Safety

- Every external command goes through `exec`, the single place that honors
  `--dry-run`, so a dry run never touches disk.
- Registry writes and removals honor dry-run too (`fsx.ts`).
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
palette, so screens do not hard-code colors (ADR 005).

A screen stays inside the terminal at any width. A flex column shrinks an
overfull child and the rows then overlap, so every row carries `flexShrink: 0`,
a list longer than its panel renders only a window around the selection
(`GameDetail`, `CatalogView`, `Activity`, `LogsView`), every dialog caps its
width to the viewport, and each line is truncated to the space it has
(`src/tui/text.ts`). `GameDetail` counts the group headers when it sizes its
window and the shell reserves the activity panel's rows.
`tests/tui/responsive.test.tsx` renders every screen from 48 to 140 columns and
fails when a line overflows or a label is drawn over its neighbor.

## Tests

`tests/unit` covers profiles (including the legacy `game.conf` parser), the
registry, depot discovery and update states, SteamCMD output parsing, the store
client, and the `.app` bundle (built against a fake Wine runtime). `tests/tui`
renders the interface in memory. `cli.test.ts` drives the real CLI process
against a temporary `DECANTER_HOME`.
