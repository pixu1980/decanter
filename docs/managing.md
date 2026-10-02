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
icon, and writes the profile. The Steam **depot id** is not exposed by any
public API: find it on [SteamDB](https://steamdb.info/) (the Depots tab) or with
`app_info_print <appid>` in SteamCMD. For a single-depot game it is often the
appid or the appid plus one, but always confirm it.

Edit the profile by hand or with `steam-mac edit <game>` to set `exe`,
`installSubdir`, `dataSubdir`, window mode and so on.

## Installing

```sh
steam-mac setup <game>       # Rosetta, Wine runtime, prefix, icon, app bundle
steam-mac download <game>    # SteamCMD, or the guided Steam console
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
| `<PREFIX>_WINE_RUNTIME` | `gptk`, `wine-devel` or `wine-staging` |
| `<PREFIX>_STEAM_ROOT` | Steam data folder |
| `SM_UPDATE_TIMEOUT` | Seconds the guided console flow waits (default 1800) |

`<PREFIX>` is derived from the slug, for example `GK2` for
`graveyard-keeper-2`.

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
