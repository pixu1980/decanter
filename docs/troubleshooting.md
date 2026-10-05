# Troubleshooting

## Start here

```sh
decanter doctor <game>        # PASS/WARN/FAIL checks with hints
decanter status <game>        # runtime, prefix, game, manifest, app bundle
decanter logs <game> -n 120   # end of the game log
```

`doctor` exits `1` when something critical is broken, so it is safe in scripts.

## The app opens but nothing happens

```sh
decanter run <game>
```

- `game not imported` means run `decanter download <game>` first.
- A missing Wine runtime means run `decanter setup <game>`.
- Gatekeeper warnings are cleared by `setup`, which strips the runtime's
  quarantine attribute.
- If the app quits immediately with no window, the profile probably points at
  the wrong executable. `decanter status <game>` prints the `exe` line; fix it
  with `decanter edit <game>` (set `"exe": "RealName.exe"`) and rebuild with
  `decanter app <game>`. Known games and freshly imported ones set it for you.

## GOG login: `redirect_uri_mismatch`

GOG validates the OAuth `redirect_uri` at the token step and only accepts the
registered `https://embed.gog.com/on_login_success?origin=client`, so a local
loopback server cannot capture the code. `decanter gog login` opens that URL,
and after logging in you paste the **redirect URL** (or just the `code`) —
`extractGogCode` pulls the `code` out of either. The token error body is shown,
so a bad or reused code says so explicitly.

## SteamCMD cannot download the depot

`decanter download` uses SteamCMD first and falls back to the Steam console.
SteamCMD downloads as **anonymous** unless a login is stored, and anonymous
accounts have no depot license, so owned games need a one-time login:

```sh
decanter login                 # uses the native Steam account name
decanter login <steam-username>  # or pick one explicitly
```

It asks for the password (and any Steam Guard code) on the terminal and stores
the login, so later `decanter download <game>` runs headless. SteamCMD fetches
the **Windows** depot through `@sSteamCmdForcePlatformType windows`.

If SteamCMD still cannot help, `download` falls back to the Steam console:
open it with `open steam://open/console`, type
`download_depot <appid> <depot>`, and wait for `Depot download complete`. The
command watches the depot folder and imports automatically. If you close the
terminal, rerun `decanter download <game>` (or `update`) later, nothing is
lost.

## `nothing to import`

No depot download was found. Download it as above, then `decanter import
<game>`. The depot id must match the app; check it on SteamDB or in SteamCMD.

## `the game is running, close it before importing`

Quit the game (and any leftover process in Activity Monitor) and retry.

## No app menu / Cmd+Q does nothing

`decanter run <game>` opens the `.app` so macOS registers the game as an app
(Dock icon, app registration). But a game with no **Win32 menu** (most Unity
games) never gets a macOS app menu from Wine, so there is no File menu and Cmd+Q
has no Quit item to trigger. `winecfg` does get a menu, which is how you can tell
the bundle is fine and the game is the cause.

Two ways to stop such a game:

- `decanter quit <game>` terminates the prefix's Wine processes (a reliable
  Cmd+Q substitute).
- `setup` compiles a small Swift helper (needs `swiftc` from the Xcode Command
  Line Tools) that registers **Cmd+Q as a global hotkey** while the game runs and
  then runs `wineserver -k`. It is global: while the game runs, Cmd+Q ends it.
  Without `swiftc` the helper is absent and `decanter quit` is the fallback.

In borderless fullscreen the game also captures the pointer, so the macOS Dock
edge-trigger does not fire. Use `decanter windowed <game>` for a native window.

## The game crashes on start under GPTK

GPTK bundles Wine 7.7, whose memory manager asserts on some 32-bit OpenGL games.
Switch the game to a current Gcenx Wine build in `game.json`:

```json
{ "wineRuntime": "wine-devel", "wineVersion": "11.18" }
```

then `decanter setup <game>`. `setup` downloads the tarball into
`~/.decanter/wine`; there is no Homebrew cask because the Wine casks conflict
with Game Porting Toolkit and are disabled by Gatekeeper.

## The icon is missing or wrong

```sh
decanter icon <game>
```

The icon comes from the Steam library art, or from the game executable when the
store has none (needs `brew install icoutils`). A missing icon never blocks the
build.

## Resetting the Wine prefix

```sh
decanter backup-saves <game>
mv ~/.decanter/games/<slug>/prefix ~/.decanter/games/<slug>/prefix.broken
decanter setup <game>
decanter download <game>
```

## Reporting a bug

Include `decanter status <game>`, `decanter doctor <game>`, the last ~100
lines of the game log, your macOS and Wine versions, and whether the game was
running when the problem happened.
