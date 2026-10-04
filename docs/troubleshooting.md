# Troubleshooting

## Start here

```sh
steam-mac doctor <game>        # PASS/WARN/FAIL checks with hints
steam-mac status <game>        # runtime, prefix, game, manifest, app bundle
steam-mac logs <game> -n 120   # end of the game log
```

`doctor` exits `1` when something critical is broken, so it is safe in scripts.

## The app opens but nothing happens

```sh
steam-mac run <game>
```

- `game not imported` means run `steam-mac download <game>` first.
- A missing Wine runtime means run `steam-mac setup <game>`.
- Gatekeeper warnings are cleared by `setup`, which strips the runtime's
  quarantine attribute.
- If the app quits immediately with no window, the profile probably points at
  the wrong executable. `steam-mac status <game>` prints the `exe` line; fix it
  with `steam-mac edit <game>` (set `"exe": "RealName.exe"`) and rebuild with
  `steam-mac app <game>`. Known games and freshly imported ones set it for you.

## SteamCMD cannot download the depot

SteamCMD needs the app on the account it logs in with. Anonymous only works for
free games. For owned games:

```sh
steam-mac config steamcmd.anonymous=false steamcmd.username=<you>
steam-mac login
```

If SteamCMD still cannot help, `download` falls back to the Steam console:
open it with `open steam://open/console`, type
`download_depot <appid> <depot>`, and wait for `Depot download complete`. The
command watches the depot folder and imports automatically. If you close the
terminal, rerun `steam-mac download <game>` (or `update`) later, nothing is
lost.

## `nothing to import`

No depot download was found. Download it as above, then `steam-mac import
<game>`. The depot id must match the app; check it on SteamDB or in SteamCMD.

## `the game is running, close it before importing`

Quit the game (and any leftover process in Activity Monitor) and retry.

## No app menu / Cmd+Q does nothing

`steam-mac run <game>` opens the `.app` so macOS registers the game as an app
(Dock icon, app registration). But a game with no **Win32 menu** (most Unity
games) never gets a macOS app menu from Wine, so there is no File menu and Cmd+Q
has no Quit item to trigger. `winecfg` does get a menu, which is how you can tell
the bundle is fine and the game is the cause.

Two ways to stop such a game:

- `steam-mac quit <game>` terminates the prefix's Wine processes (a reliable
  Cmd+Q substitute).
- `setup` compiles a small Swift helper (needs `swiftc` from the Xcode Command
  Line Tools) that registers **Cmd+Q as a global hotkey** while the game runs and
  then runs `wineserver -k`. It is global: while the game runs, Cmd+Q ends it.
  Without `swiftc` the helper is absent and `steam-mac quit` is the fallback.

In borderless fullscreen the game also captures the pointer, so the macOS Dock
edge-trigger does not fire. Use `steam-mac windowed <game>` for a native window.

## The game crashes on start under GPTK

GPTK bundles Wine 7.7, whose memory manager asserts on some 32-bit OpenGL games.
Switch the game to a current Gcenx Wine build in `game.json`:

```json
{ "wineRuntime": "wine-devel", "wineVersion": "11.18" }
```

then `steam-mac setup <game>`. `setup` downloads the tarball into
`~/.steam-mac/wine`; there is no Homebrew cask because the Wine casks conflict
with Game Porting Toolkit and are disabled by Gatekeeper.

## The icon is missing or wrong

```sh
steam-mac icon <game>
```

The icon comes from the Steam library art, or from the game executable when the
store has none (needs `brew install icoutils`). A missing icon never blocks the
build.

## Resetting the Wine prefix

```sh
steam-mac backup-saves <game>
mv ~/Games/<slug>-prefix ~/Games/<slug>-prefix.broken
steam-mac setup <game>
steam-mac download <game>
```

## Reporting a bug

Include `steam-mac status <game>`, `steam-mac doctor <game>`, the last ~100
lines of the game log, your macOS and Wine versions, and whether the game was
running when the problem happened.
