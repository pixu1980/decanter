# Managing a game

`decanter` is built to be run over and over for the whole life of an install:
`setup` once, `download` and `import` on first install, `update` whenever the
game is patched, `doctor` and `status` whenever something looks wrong. Every
command is idempotent, and destructive actions ask first.

## Mental model

```
Store (Steam/GOG/Epic)   ~/.decanter/games/<slug>/       Wine prefix
  appid / gogId /        game.json (profile)             games/<slug>/prefix
  epicAppName ── add ──▶ manifest  (installed build)     drive_c/<installSubdir>/
                         assets/   (icon)                        ▲
                         saves/    (saves, a link          │ import (rsync)
                                    when in the prefix)     │
store downloader ─────── download ──▶ ~/.decanter/{steamcmd,gog,epic}/...
```

The depot download is **moved**, not copied: after `import` the depot folder is
empty, so the next download fetches the current build again.

## Stores

`decanter` speaks three stores; `profile.store` is `steam`, `gog` or `epic`, and
`src/core/stores.ts` is the single place that describes them.

| Store | Identifier | Download | Login |
|---|---|---|---|
| Steam | `appid` + a depot id | SteamCMD (`download_depot`), a guided Steam console as fallback | `decanter login steam` |
| GOG | `gogId` (product id) | the Galaxy content system (build → manifest → chunks) | `decanter login gog` |
| Epic | `epicAppName` + namespace | the BuildPatch manifest | `decanter login epic` |

`list <store>` prints one store's owned games. `add --store <store>` registers
one; each store has its own id flag (`--appid`, `--gog-id`, `--epic-app`). The
download, import and icon steps dispatch on the store, so the rest of the
lifecycle, setup, run, window mode, saves, backups, uninstall, is identical.

## Adding a game

```sh
# Steam
decanter add "Graveyard Keeper 2" --depot 4358691
decanter add --appid 57640 --depot 57641
# GOG
decanter add --store gog --gog-id 1207659163
# Epic
decanter add --store epic --epic-app Boga
```

`add` resolves the app on the selected store, caches its metadata, fetches the
icon, writes the profile, then provisions the game: `setup`, `download` and
`import` run automatically (for Steam, SteamCMD is downloaded by `setup`). When a
step cannot continue (no depot id, no login) the game stays registered and the
command says how to resume.

Running `add` again is safe: a registered game that is **not installed** is
provisioned again without needing `--force`, while an already **installed** game
is left alone (pass `--force` to re-register and re-provision it).

`add` resolves the Steam **depot id** itself: from the built-in catalog for a
known game, then from the Steam client's own cache (`appcache/appinfo.vdf`,
offline), then by asking SteamCMD (`app_info_print`). Pass `--depot` to override
it. When none answers, find it on [SteamDB](https://steamdb.info/) (the Depots
tab). GOG and Epic need no depot: the product id or the app name resolves the
build.

### Known games and executable detection

A game in the built-in catalog (currently Graveyard Keeper 2, appid 4358690) is
fully provisioned with no flags: the catalog supplies the executable, install
and save folders, the Unity window-mode registry block and the update checks.
Pass `--exe`, `--slug` or `--depot` to override any of it; the flags win.

For any other game the profile starts with the placeholder `<slug>.exe`. After
`import`, if that file is not in the game folder, `decanter` detects the real
executable (a name match against the game, otherwise the largest `.exe`),
records it in `game.json` and rebuilds the app bundle. You can always set it by
hand with `decanter edit <game>`, then `decanter app <game>`.

Edit the profile by hand or with `decanter edit <game>` to set `exe`,
`installSubdir`, `dataSubdir`, window mode and so on.

## Installing

`add` already ran these steps; run them again to retry or to reinstall:

```sh
decanter setup <game>       # Rosetta, Wine runtime, wow64 fix, prefix, SteamCMD, icon, app bundle
decanter download <game>    # SteamCMD, or the guided Steam console
decanter import <game>      # move a finished download into the prefix
decanter run <game>         # or open the .app
```

For a Gcenx `wine-devel` / `wine-staging` runtime on Apple Silicon, `setup` also
installs the Rosetta `wow64cpu` fix: Wine switches 32↔64 bit with a far jump
that Rosetta 2 sometimes does not honor, which crashes 32-bit games in
`wow64cpu.dll`. The patched DLL (far returns) is downloaded once, verified by
SHA-256 and copied into both the runtime and the prefix. See
[troubleshooting](troubleshooting.md#the-game-crashes-right-after-the-d3d-device-is-created-32-bit-games).

For Steam, `download` uses SteamCMD. Anonymous downloads work for free games; for
owned games run `decanter login steam` once so SteamCMD remembers the account.
Add `--manual` to skip SteamCMD and drive the Steam console yourself. For GOG and
Epic, log in once (`decanter login gog` / `decanter login epic`) and `download`
fetches the build through the store's own content system.

## Updating

```sh
decanter update <game> --check   # exit 0 up to date, 3 update needed, 1 error
decanter update <game>           # download and import the newer build
```

`update` compares the recorded manifest with the newest one Steam has cached. If
a download is already waiting it just imports it. If not, it downloads it the
same way as `download`.

## The app bundle

`decanter app <game>` rebuilds `~/Applications/<game>.app`. The bundle hosts
its own copy of the Wine loader plus symlinks into the shared runtime, which is
what gives the running game a real macOS app menu and a working Cmd+Q. Rebuild
it after a runtime update, or whenever `doctor` says the bundle runtime is
missing.

The bundle name is sanitized for macOS: a `:` becomes ` - ` (the Finder shows a
`:` in a filename as `/`) and symbol characters such as `®`, `™` and `©` are
dropped. `The Settlers® 2: 10th Anniversary` therefore builds as
`The Settlers 2 - 10th Anniversary.app`. Rebuilding removes the bundle left by
the older, unsanitized name.

## The catalog

`c` in the interface opens the catalog: every **game** the three stores own, in
one filterable table. `list <store>` still prints the provider's full list, the
catalog drops what is not a game. Steam's `common.type` in the appinfo cache
separates a `Game` from a `Tool`, so runtimes, dedicated servers, SDKs, DLC,
soundtracks and demos stay out.

A game owned on more than one store is a single row listing its stores. `enter`
installs the only copy directly, or opens a **store picker** when the game is
owned on several, so you choose which store to fetch from. A row marked
`installed` (from any store) opens the registered game instead.

The catalog reads the same caches `list` writes: Steam comes from the client's
owner cache offline, GOG and Epic from their cached library. Run `list gog` /
`list epic` once (with a login) before the catalog shows them.

While a game installs, the **Install** screen shows the resolved metadata (game,
store, id) and streams the engine output. When it finishes the interface returns
to the games list with the new game selected; `esc` cancels a running install.

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

Then `decanter windowed <game>` and `decanter fullscreen <game>` flip the
setting (the game must be closed). `status` shows the current mode.

## Backups and a clean reinstall

```sh
decanter backup-saves <game>     # to ~/.decanter/backups/<label>-saves-backup-<stamp>
decanter uninstall <game> --purge
decanter setup <game>
decanter download <game>
```

## Credentials and the first-run wizard

No credential ships in the source. They all live in `~/.decanter/config.json`
under `credentials`, and `decanter init` collects them in one pass (the TUI opens
the same screen on a first run). `decanter config <id>=<value>` writes one:

```sh
decanter init
decanter config gog.clientId=<id>
decanter config steam.apiKey=<key>
```

| Credential id | What it is | Where to get it |
|---|---|---|
| `steam.apiKey` | Steam Web API key, for `list steam` | the Steam Web API key page (free) |
| `steam.steamId` | SteamID64, auto-detected from Steam when empty | the steamid.io lookup |
| `steamGridDb` | SteamGridDB key, for missing artwork | the SteamGridDB profile |
| `gog.clientId` / `gog.clientSecret` | GOG Galaxy public client | the gogdl or Heroic source |
| `epic.clientId` / `epic.clientSecret` | Epic launcher public client | the legendary source |

A store whose credentials are missing still answers `list` from its cache; the
credential is required only to fetch, and `decanter init` sets it. The catalog
reads each store's local cache before the fetch.

## Settings and environment

`decanter config` prints the machine-wide settings; `decanter config
steamRoot=/path` or `decanter config steamcmd.username=me` changes them.
Settings live in `~/.decanter/config.json`.

| Variable | Purpose |
|---|---|
| `DECANTER_HOME` | override the registry root (default `~/.decanter`) |
| `<PREFIX>_PREFIX` | Wine prefix for one game |
| `<PREFIX>_APP` | App bundle location |
| `<PREFIX>_WINE_APP` | Wine runtime app |
| `<PREFIX>_WINE_RUNTIME` | `gptk`, `gptk-apple`, `wine-devel` or `wine-staging` |
| `<PREFIX>_GPTK_APPLE_SOURCE` | mounted Apple GPTK DMG directory for `gptk-apple` |
| `<PREFIX>_STEAM_ROOT` | Steam data folder |
| `<PREFIX>_SAVES` | Saves folder for one game |
| `SM_UPDATE_TIMEOUT` | Seconds the guided console flow waits (default 1800) |

`credentials.steam.apiKey` / `credentials.steam.steamId` feed `list steam`,
`credentials.steamGridDb` feeds the missing-artwork lookup, and
`credentials.gog` / `credentials.epic` carry the launcher public clients. See
[the credentials section](#credentials-and-the-first-run-wizard) to set them.

`<PREFIX>` is derived from the slug, for example `GK2` for
`graveyard-keeper-2`.

## GPTK 4.0 from Apple's DMG

Apple ships `Game Porting Toolkit 4.0` only from
[Apple developer downloads](https://developer.apple.com/download/all/) (an Apple ID is
required); Gcenx's Homebrew cask is still on D3DMetal 3.0. To use the newer
D3DMetal for one game:

1. Download and mount the DMG (the volume is named
   *Evaluation environment for Windows games &lt;version&gt;*).
2. Point the toolkit at it:

   ```sh
   decanter config appleGptkSource="/Volumes/Evaluation environment for Windows games 4.0 beta 2"
   ```

3. Set the game's runtime to `gptk-apple`. Graveyard Keeper 2 already gets it
   from the catalog; for other games pass `--runtime gptk-apple` to `add`, or
   edit `~/.decanter/games/<slug>/game.json`.
4. Rebuild the game:

   ```sh
   decanter setup <game>
   decanter doctor <game>
   ```

`setup` clones the Gcenx loader into `~/.decanter/wine/gptk-apple` and overlays
the DMG's `redist/lib/external` (D3DMetal framework plus `libd3dshared.dylib`)
on top of it. The redist's `wine` bridge DLLs are skipped: the 4.0 bridges do not
initialize on Apple's frozen Wine 7.7, while the 3.0 bridges the loader already
carries work with the 4.0 framework. The clone uses APFS copy-on-write, so it
costs only the new D3DMetal. The default `gptk` runtime is untouched, and
`doctor` shows which D3DMetal a game now uses. Once the overlay exists the DMG
no longer needs to stay mounted.

## Runtime upgrades and rollback

`decanter runtime <game>` shows which Wine + Direct3D stack a game uses and the
launches recorded for it:

```
$ decanter runtime graveyard-keeper-2
Graveyard Keeper 2, runtime
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

`decanter runtime-upgrade <game>` tries the newest runtime this machine can
offer:

- `wine-devel` / `wine-staging` advance to the newest
  [Gcenx](https://github.com/Gcenx/macOS_Wine_builds) release and download it.
- `gptk-apple` re-overlays the D3DMetal from the mounted Apple DMG when it is
  newer.
- `gptk` switches to the `gptk-apple` overlay when the Apple DMG is newer, and
  otherwise runs `brew upgrade --cask gcenx/wine/game-porting-toolkit`.

The app bundle is rebuilt after a change. Every launch records the runtime in
the profile, so `decanter runtime-rollback <game>` returns to the most recent
runtime that is not the current one, the fastest way back from a `gptk` →
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

- `tricks`, winetricks verbs installed once during `setup` (needs the
  `winetricks` formula; the applied set is recorded in
  `<prefix>/.decanter-tricks`).
- `dllOverrides`, extra `WINEDLLOVERRIDES` for the launch.
- `args`, extra arguments for the game executable.
- `virtualDesktop`, run in a Wine virtual desktop of that size, so a game that
  grabs the screen stays in a closable window (e.g. The Settlers II needs
  `d3dx9` and a virtual desktop).
- `env`, extra environment variables for the launch.

Example, The Settlers II: 10th Anniversary (GOG, 32-bit Direct3D 9):
`wineRuntime: "wine-devel"`, `wineVersion: "11.18"`,
`wine.tricks: ["d3dx9"]`, `wine.virtualDesktop: "1280x720"`. The pinned version
is the one `setup` applies the Rosetta `wow64cpu` fix to.

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
decanter migrate ../graveyard-keeper-2
decanter migrate ../broken-sword-directors-cut --force
```

`migrate` reads a legacy `game.conf`, copies its icon and writes the equivalent
`game.json`. Shell hooks (`game_post_import`, `game_doctor_extra`) are preserved
as `hooks.postImport` and `hooks.doctorExtra`.
