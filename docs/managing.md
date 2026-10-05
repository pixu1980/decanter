# Managing a game

`steam-mac` is built to be run over and over for the whole life of an install:
`setup` once, `download` and `import` on first install, `update` whenever the
game is patched, `doctor` and `status` whenever something looks wrong. Every
command is idempotent, and destructive actions ask first.

## Mental model

```
Steam store            ~/.steam-mac/games/<slug>/        Wine prefix
   appid  ──── add ──▶  game.json (profile)               ~/Games/<slug>-prefix
                        manifest  (installed build)       drive_c/<installSubdir>/
                        assets/   (icon)                         ▲
                                                                 │ import (rsync)
SteamCMD / Steam console ────── download ──▶ steamapps/content/app_<appid>/depot_<depot>/
```

The depot download is **moved**, not copied: after `import` the depot folder is
empty, so the next download fetches the current build again.

## Adding a game

```sh
steam-mac add "Graveyard Keeper 2" --depot 4358691
steam-mac add --appid 57640 --depot 57641
```

`add` resolves the app on the Steam store, caches its metadata, fetches the
icon, writes the profile, then provisions the game: `setup`, `download` and
`import` run automatically (SteamCMD is downloaded by `setup`). When a step
cannot continue (no depot id, no login) the game stays registered and the
command says how to resume.

Running `add` again is safe: a registered game that is **not installed** is
provisioned again without needing `--force`, while an already **installed** game
is left alone (pass `--force` to re-register and re-provision it).

The Steam **depot id** is not exposed by any public API: find it on
[SteamDB](https://steamdb.info/) (the Depots tab) or with
`app_info_print <appid>` in SteamCMD. For a single-depot game it is often the
appid or the appid plus one, but always confirm it.

### Known games and executable detection

A game in the built-in catalog (currently Graveyard Keeper 2, appid 4358690) is
fully provisioned with no flags: the catalog supplies the executable, install
and save folders, the Unity window-mode registry block and the update checks.
Pass `--exe`, `--slug` or `--depot` to override any of it; the flags win.

For any other game the profile starts with the placeholder `<slug>.exe`. After
`import`, if that file is not in the game folder, `steam-mac` detects the real
executable (a name match against the game, otherwise the largest `.exe`),
records it in `game.json` and rebuilds the app bundle. You can always set it by
hand with `steam-mac edit <game>`, then `steam-mac app <game>`.

Edit the profile by hand or with `steam-mac edit <game>` to set `exe`,
`installSubdir`, `dataSubdir`, window mode and so on.

## Installing

`add` already ran these steps; run them again to retry or to reinstall:

```sh
steam-mac setup <game>       # Rosetta, Wine runtime, prefix, SteamCMD, icon, app bundle
steam-mac download <game>    # SteamCMD, or the guided Steam console
steam-mac import <game>      # move a finished download into the prefix
steam-mac run <game>         # or open the .app
```

`download` uses SteamCMD. Anonymous downloads work for free games; for owned
games run `steam-mac login` once so SteamCMD remembers the account. Add
`--manual` to skip SteamCMD and drive the Steam console yourself.

## Updating

```sh
steam-mac update <game> --check   # exit 0 up to date, 3 update needed, 1 error
steam-mac update <game>           # download and import the newer build
```

`update` compares the recorded manifest with the newest one Steam has cached. If
a download is already waiting it just imports it. If not, it downloads it the
same way as `download`.

## The app bundle

`steam-mac app <game>` rebuilds `~/Applications/<game>.app`. The bundle hosts
its own copy of the Wine loader plus symlinks into the shared runtime, which is
what gives the running game a real macOS app menu and a working Cmd+Q. Rebuild
it after a runtime update, or whenever `doctor` says the bundle runtime is
missing.

## Window mode

Unity games store their screen mode as a JSON blob in the Wine registry. Set in
`game.json`:

```json
{
  "window": {
    "enabled": true,
    "screenModeKey": "screenMode",
    "regKey": "HKCU\\Software\\<Publisher>\\<Game>",
    "settingsValue": "settings_h...",
    "unityModeValue": "Screenmanager Fullscreen mode_h..."
  }
}
```

Then `steam-mac windowed <game>` and `steam-mac fullscreen <game>` flip the
setting (the game must be closed). `status` shows the current mode.

## Backups and a clean reinstall

```sh
steam-mac backup-saves <game>     # to ~/Documents/<label>-saves-backup-<stamp>
steam-mac uninstall <game> --purge
steam-mac setup <game>
steam-mac download <game>
```

## Settings and environment

`steam-mac config` prints the machine-wide settings; `steam-mac config
steamRoot=/path` or `steam-mac config steamcmd.username=me` changes them.
Settings live in `~/.steam-mac/config.json`.

| Variable | Purpose |
|---|---|
| `SM_HOME` | override the registry root (default `~/.steam-mac`) |
| `<PREFIX>_PREFIX` | Wine prefix for one game |
| `<PREFIX>_APP` | App bundle location |
| `<PREFIX>_WINE_APP` | Wine runtime app |
| `<PREFIX>_WINE_RUNTIME` | `gptk`, `gptk-apple`, `wine-devel` or `wine-staging` |
| `<PREFIX>_GPTK_APPLE_SOURCE` | mounted Apple GPTK DMG directory for `gptk-apple` |
| `<PREFIX>_STEAM_ROOT` | Steam data folder |
| `SM_UPDATE_TIMEOUT` | Seconds the guided console flow waits (default 1800) |

`steamGridDbKey` in `config.json` is the SteamGridDB API key used when the
Steam artwork is missing; change it with `steam-mac config
steamGridDbKey=<key>`.

`<PREFIX>` is derived from the slug, for example `GK2` for
`graveyard-keeper-2`.

## GPTK 4.0 from Apple's DMG

Apple ships `Game Porting Toolkit 4.0` only from
[developer.apple.com](https://developer.apple.com/download/all/) (an Apple ID is
required); Gcenx's Homebrew cask is still on D3DMetal 3.0. To use the newer
D3DMetal for one game:

1. Download and mount the DMG (the volume is named
   *Evaluation environment for Windows games &lt;version&gt;*).
2. Point the toolkit at it:

   ```sh
   steam-mac config appleGptkSource="/Volumes/Evaluation environment for Windows games 4.0 beta 2"
   ```

3. Set the game's runtime to `gptk-apple`. Graveyard Keeper 2 already gets it
   from the catalog; for other games pass `--runtime gptk-apple` to `add`, or
   edit `~/.steam-mac/games/<slug>/game.json`.
4. Rebuild the game:

   ```sh
   steam-mac setup <game>
   steam-mac doctor <game>
   ```

`setup` clones the Gcenx loader into `~/.steam-mac/wine/gptk-apple` and overlays
the DMG's `redist/lib/external` (D3DMetal framework plus `libd3dshared.dylib`)
on top of it. The redist's `wine` bridge DLLs are skipped: the 4.0 bridges do not
initialise on Apple's frozen Wine 7.7, while the 3.0 bridges the loader already
carries work with the 4.0 framework. The clone uses APFS copy-on-write, so it
costs only the new D3DMetal. The default `gptk` runtime is untouched, and
`doctor` shows which D3DMetal a game now uses. Once the overlay exists the DMG
no longer needs to stay mounted.

## Runtime upgrades and rollback

`steam-mac runtime <game>` shows which Wine + Direct3D stack a game uses and the
launches recorded for it:

```
$ steam-mac runtime graveyard-keeper-2
Graveyard Keeper 2 — runtime
  runtime        gptk-apple
  description    Game Porting Toolkit (Apple) · wine-7.7 · D3DMetal 4.0b2
  wine           wine-7.7
  direct3d       D3DMetal 4.0b2
  pinned version not pinned
  latest         n/a
```

The description reads *runtime · Wine build · Direct3D backend*. A game whose
profile carries the `d3dx9` winetricks verb is reported as `DX9 (native
d3dx9)`; a runtime without D3DMetal otherwise runs through `WineD3D`. The same
line appears in `status`, `doctor` and the TUI runtime panel.

`steam-mac runtime-upgrade <game>` tries the newest runtime this machine can
offer:

- `wine-devel` / `wine-staging` advance to the newest
  [Gcenx](https://github.com/Gcenx/macOS_Wine_builds) release and download it.
- `gptk-apple` re-overlays the D3DMetal from the mounted Apple DMG when it is
  newer.
- `gptk` switches to the `gptk-apple` overlay when the Apple DMG is newer, and
  otherwise runs `brew upgrade --cask gcenx/wine/game-porting-toolkit`.

The app bundle is rebuilt after a change. Every launch records the runtime in
the profile, so `steam-mac runtime-rollback <game>` returns to the most recent
runtime that is not the current one — the fastest way back from a `gptk` →
`gptk-apple` switch or a newer `wine-devel` build that misbehaves. In the TUI
the **Runtime**, **Upgrade runtime** and **Roll back runtime** actions do the
same.

## Per-game Wine tweaks

Some games need Wine tweaks of their own. A profile carries a `wine` block that
`setup` and the generated `launch` script apply:

```json
"wine": {
  "tricks": ["d3dx9"],
  "dllOverrides": ["d3dx9_43=n"],
  "args": [],
  "virtualDesktop": "1280x720",
  "env": { "WINEDLLOVERRIDES": "..." }
}
```

- `tricks` — winetricks verbs installed once during `setup` (needs the
  `winetricks` formula; the applied set is recorded in
  `<prefix>/.steam-mac-tricks`).
- `dllOverrides` — extra `WINEDLLOVERRIDES` for the launch.
- `args` — extra arguments for the game executable.
- `virtualDesktop` — run in a Wine virtual desktop of that size, so a game that
  grabs the screen stays in a closable window (e.g. The Settlers II needs
  `d3dx9` and a virtual desktop).
- `env` — extra environment variables for the launch.

Example, The Settlers II: 10th Anniversary (GOG, 32-bit Direct3D 9):
`wineRuntime: "wine-devel"`, `wine.tricks: ["d3dx9"]`,
`wine.virtualDesktop: "1280x720"`.

`import` fills the `wine` block automatically: a PE reader switches a 32-bit
executable to `wine-devel` and adds the D3DX winetricks, and the Lutris API
adds the community's winetricks and DLL overrides when the game is listed
there. The catalog overrides both for hand-tuned games.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success (and `update --check`: up to date) |
| `1` | error: missing game, unknown command, `doctor` failure |
| `3` | `update --check` only: an update is available or waiting to be imported |

## Migrating the legacy repos

```sh
steam-mac migrate ../graveyard-keeper-2
steam-mac migrate ../broken-sword-directors-cut --force
```

`migrate` reads a legacy `game.conf`, copies its icon and writes the equivalent
`game.json`. Shell hooks (`game_post_import`, `game_doctor_extra`) are preserved
as `hooks.postImport` and `hooks.doctorExtra`.
