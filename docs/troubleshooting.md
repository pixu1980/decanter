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

## `open` fails with error -1712

```
decanter: command failed (1): open /Users/you/Applications/<game>.app
_LSOpenURLsWithCompletionHandler() failed with error -1712.
```

macOS reports `-1712` when LaunchServices thinks the bundle is already open. A
previous session can leave the virtual-desktop `explorer` alive, so the bundle's
`launch` script waits forever and the app never closes. `decanter run` stops the
prefix's Wine processes and retries `open` once, and `decanter quit` detects the
open bundle even when the game executable is gone. If it still fails, run
`decanter quit <game>`, then `pkill -f 'Contents/MacOS/launch'` and retry.

## GOG login: `redirect_uri_mismatch`

GOG validates the OAuth `redirect_uri` at the token step and only accepts the
registered `https://embed.gog.com/on_login_success?origin=client`, so a local
loopback server cannot capture the code. `decanter login gog` opens that URL,
and after logging in you paste the **redirect URL** (or just the `code`) —
`extractGogCode` pulls the `code` out of either. The token error body is shown,
so a bad or reused code says so explicitly.

## Epic login: the authorization code is rejected

`decanter login epic` opens the Epic OAuth URL; after logging in you paste the
`code` it prints (or the whole redirect URL — `extractEpicCode` pulls the code
out of either). The code is single-use and short-lived, so an expired or
already-used one fails at the token exchange with the error body shown; run
`decanter login epic` again for a fresh code. Tokens live under
`~/.decanter/epic/` and refresh automatically; when a download asks for a login
the refresh token has expired too, so log in again.

## SteamCMD cannot download the depot

`decanter download` uses SteamCMD first and falls back to the Steam console.
SteamCMD downloads as **anonymous** unless a login is stored, and anonymous
accounts have no depot license, so owned games need a one-time login:

```sh
decanter login steam                # uses the native Steam account name
decanter login steam <username>     # or pick one explicitly
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

GPTK bundles Wine 7.7, whose memory manager asserts on some 32-bit games
(`virtual.c`, `alloc_pages_vprot`). GPTK 4.0's D3DMetal does not help: the assert
is in Wine, not in Direct3D. Switch the game to a Gcenx Wine build in
`game.json`:

```json
{ "wineRuntime": "wine-devel", "wineVersion": "11.18" }
```

then `decanter setup <game>`. `setup` downloads the tarball into
`~/.decanter/wine` and installs the Rosetta `wow64cpu` fix (next section); there
is no Homebrew cask because the Wine casks conflict with Game Porting Toolkit
and are disabled by Gatekeeper.

## The game crashes right after the D3D device is created (32-bit games)

A 32-bit game can die with a Wine page fault just as it instantiates Direct3D, or
later when a mission loads:

```
wine: Unhandled page fault on read access to 00002EC5 at address 7BF21135 (thread 015c), starting debugger...
```

Wine's **new WoW64** runs the game as a 32-bit app inside a 64-bit process and
switches the CPU between 32-bit and 64-bit mode on every system call. Upstream
Wine does that switch with a far *jump*; Rosetta 2 on Apple Silicon sometimes
does not change modes on a far jump, so the 64-bit `syscall_32to64` thunk runs
as 32-bit code and faults. The fault lands in `wow64cpu.dll` (or the 32-bit
`ntdll.dll` thunk beside it) and the address decodes to a small constant like
`0x2EC5`. It is a Wine/Rosetta bug, not a decanter or Direct3D configuration
problem, and it is intermittent.

The fix is a `wow64cpu.dll` rebuilt to use far *returns*, which Rosetta handles
(`WOW64_FIX_SOURCE` in `src/core/wow64.ts`). `setup` downloads the prebuilt for
the pinned Wine version, verifies its SHA-256 and copies it into both the runtime
and the prefix (`Wine loads wow64cpu from the prefix, and wineboot copies it
there from the runtime`). Nothing to do by hand: re-run `decanter setup <game>`
and the log prints `applied the Rosetta 2 wow64cpu fix`. `setup` warns when the
pinned version has no prebuilt:

```
Wine devel 11.16: no Rosetta wow64cpu fix for this version: 32-bit games may crash in wow64cpu.dll
```

Then pin a version that has one (the catalog pins The Settlers II - 10th
Anniversary to `11.18`) or build the DLL for that version with the upstream
`build.sh` and add its digest to `ROSETTA_WOW64_FIX`. GPTK is no escape: its Wine
7.7 uses the old WoW64 but asserts on this class of game (`virtual.c`).

## The icon is missing or wrong

```sh
decanter icon <game>
```

The icon comes from the store the game came from (the Steam library art, the GOG
artwork or the Epic catalog images), then from the game executable when the
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
