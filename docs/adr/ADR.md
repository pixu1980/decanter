# Architecture Decision Records

Every decision this project has taken, newest first. The numbered files in
this directory are the source of truth; this index is generated from them by
`pix_tool_process_adr`, so editing it by hand is work the next call throws away.

## Index

| #                                                                                              | Title                                                                               | Date       | Status     | Tags                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- | ---------- | ----------------------------------- |
| [013](013-overlay-apple-gptk-4-d3dmetal-onto-the-gcenx-loader-for-the-gptk-apple-runtime.md)   | Overlay Apple GPTK 4 D3DMetal onto the Gcenx loader for the gptk-apple runtime      | 2026-10-03 | accepted   | wine, runtime, macos, gptk          |
| [012](012-fill-known-game-profiles-from-a-catalog-and-detect-the-executable-after-import.md)   | Fill known game profiles from a catalog and detect the executable after import      | 2026-10-03 | accepted   | add, registry, lifecycle, profile   |
| [011](011-make-add-idempotent-for-a-registered-game-that-is-not-installed.md)                  | Make add idempotent for a registered game that is not installed                     | 2026-10-03 | accepted   | add, registry, lifecycle            |
| [010](010-resolve-missing-icons-through-a-fallback-chain-with-steamgriddb-and-a-placeholde.md) | Resolve missing icons through a fallback chain with SteamGridDB and a placeholder   | 2026-10-03 | accepted   | icons, steamgriddb, assets          |
| [009](009-provision-a-game-end-to-end-when-it-is-added.md)                                     | Provision a game end to end when it is added                                        | 2026-10-03 | accepted   | lifecycle, add, steamcmd            |
| [008](008-keep-the-tui-at-the-full-viewport.md)                                                | Keep the TUI at the full viewport                                                   | 2026-10-03 | accepted   | tui, opentui, layout                |
| [007](007-size-the-tui-at-60-of-the-viewport-and-adapt-its-rows.md)                            | Size the TUI at 60% of the viewport and adapt its rows                              | 2026-10-03 | superseded | tui, opentui, layout                |
| [006](006-uninstall-from-the-tui-purges-the-prefix-and-forgets-the-game.md)                    | Uninstall from the TUI purges the prefix and forgets the game                       | 2026-10-03 | accepted   | tui, lifecycle, uninstall, registry |
| [005](005-confirm-destructive-tui-actions-in-app-and-run-lifecycle-commands-non-interactiv.md) | Confirm destructive TUI actions in-app and run lifecycle commands non-interactively | 2026-10-03 | accepted   | tui, opentui, interaction, safety   |
| [004](004-resolve-the-wine-runtime-per-game-gptk-or-a-pinned-gcenx-build.md)                   | Resolve the Wine runtime per game (GPTK or a pinned Gcenx build)                    | 2026-10-02 | accepted   | wine, runtime, macos                |
| [003](003-download-depots-with-steamcmd-fall-back-to-the-steam-console.md)                     | Download depots with SteamCMD, fall back to the Steam console                       | 2026-10-02 | accepted   | steam, steamcmd, download           |
| [002](002-use-opentui-with-react-for-the-terminal-interface.md)                                | Use OpenTUI with React for the terminal interface                                   | 2026-10-02 | accepted   | tui, opentui, react                 |
| [001](001-unify-the-per-game-wrapper-repos-into-one-typescript-registry.md)                    | Unify the per-game wrapper repos into one TypeScript registry                       | 2026-10-02 | accepted   | architecture, registry, typescript  |

## What each decision says

The opening sentence of each decision and of what it cost, lifted from the
file. Where a line stops short the rest is in the ADR.

| ADR                                                                                            | Decision                                                                                                                                                                                                                        | Consequence                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [013](013-overlay-apple-gptk-4-d3dmetal-onto-the-gcenx-loader-for-the-gptk-apple-runtime.md)   | Add an opt-in gptk-apple runtime. resolveWine points it at the gptk-apple overlay app under the wine directory of the steam-mac home, and reads the mounted DMG directory from the appleGptkSource config field. ensureWine...  | Games can use D3DMetal 4.0b2 while the default stays on 3.0. The overlay costs only the new D3DMetal because the loader is cloned copy-on-write. |
| [012](012-fill-known-game-profiles-from-a-catalog-and-detect-the-executable-after-import.md)   | A built-in catalog (src/core/catalog.ts, keyed by appid) pre-fills the profile fields the Steam store cannot supply (exe, install/save subfolders, manifest name, save patterns, version pattern, Unity window registry...      | Graveyard Keeper 2 is provisioned correctly with no flags and any other game gets a usable exe automatically.                                    |
| [011](011-make-add-idempotent-for-a-registered-game-that-is-not-installed.md)                  | addGame checks whether the existing game is installed through gameInstalled and the resolved paths.                                                                                                                             | Re-adding an uninstalled game reinstalls it, and an installed game is never re-downloaded by accident.                                           |
| [010](010-resolve-missing-icons-through-a-fallback-chain-with-steamgriddb-and-a-placeholde.md) | provisionIcon tries the Steam store art, then SteamGridDB (square icons first, then vertical grids, filtered to the image types sips can read), then the smaller Steam artwork (logos and capsules), then the icon embedded...  | Almost every game gets an icon, including offline ones.                                                                                          |
| [009](009-provision-a-game-end-to-end-when-it-is-added.md)                                     | addGame writes the profile and the icon, then calls provisionGame, which runs cmdSetup (now installing SteamCMD through ensureSteamcmd), cmdDownload and cmdImport in order and re-provisions the icon at the end.              | One command installs a game end to end and SteamCMD is provisioned by setup.                                                                     |
| [008](008-keep-the-tui-at-the-full-viewport.md)                                                | The interface fills the whole terminal again, as it did before ADR 007. The app root is a single full-size column and the components no longer receive a frame width: GameList and StatusBar drop their compact and clipping... | The list, the status bar and the logs use every available column and the code loses the prop plumbing ADR 007 introduced.                        |
| [007](007-size-the-tui-at-60-of-the-viewport-and-adapt-its-rows.md)                            | The app renders a centred frame of 60% width and 60% height, computed from the terminal dimensions.                                                                                                                             | The interface reads as a window with breathing room and never overlaps text at 80 columns.                                                       |
| [006](006-uninstall-from-the-tui-purges-the-prefix-and-forgets-the-game.md)                    | The TUI's uninstall action runs cmdUninstall with purge: true and then removeGameRecord, so the app bundle, the Wine prefix and the registry record are all deleted and the row disappears after the reload.                    | The list reflects reality after an uninstall.                                                                                                    |
| [005](005-confirm-destructive-tui-actions-in-app-and-run-lifecycle-commands-non-interactiv.md) | Destructive actions confirm through an in-app dialog and the TUI runs them with yes: true, so no lifecycle command ever reads stdin under the renderer.                                                                         | Uninstall no longer hangs and destructive actions look and behave consistently across screens.                                                   |
| [004](004-resolve-the-wine-runtime-per-game-gptk-or-a-pinned-gcenx-build.md)                   | wineRuntime selects gptk (default) or wine-devel / wine-staging. setup provisions the gptk cask through Homebrew, or downloads the pinned Gcenx tarball (wineVersion) into ~/.steam-mac/wine.                                   | Games GPTK cannot run now work, with a pinned reproducible runtime and no cask conflict.                                                         |
| [003](003-download-depots-with-steamcmd-fall-back-to-the-steam-console.md)                     | download runs SteamCMD with +@sSteamCmdForcePlatformType windows +download_depot, which fetches the Windows depot headlessly.                                                                                                   | Owned games download without touching the Steam client once logged in, and free games need no login.                                             |
| [002](002-use-opentui-with-react-for-the-terminal-interface.md)                                | Build the interface with @opentui/react.                                                                                                                                                                                        | A single keyboard-driven interface with Flexbox layout and no browser.                                                                           |
| [001](001-unify-the-per-game-wrapper-repos-into-one-typescript-registry.md)                    | Replace all five with a single TypeScript repo, steam-mac.                                                                                                                                                                      | One place to add, run, update and remove any game, no clone per game.                                                                            |

## By theme

Tags carried by 3 or more decisions. A decision appears under every
theme it carries, and the early ADRs that predate the tag field are listed last.

### tui

- [008](008-keep-the-tui-at-the-full-viewport.md) Keep the TUI at the full viewport
- [007](007-size-the-tui-at-60-of-the-viewport-and-adapt-its-rows.md) Size the TUI at 60% of the viewport and adapt its rows
- [006](006-uninstall-from-the-tui-purges-the-prefix-and-forgets-the-game.md) Uninstall from the TUI purges the prefix and forgets the game
- [005](005-confirm-destructive-tui-actions-in-app-and-run-lifecycle-commands-non-interactiv.md) Confirm destructive TUI actions in-app and run lifecycle commands non-interactively
- [002](002-use-opentui-with-react-for-the-terminal-interface.md) Use OpenTUI with React for the terminal interface

### lifecycle

- [012](012-fill-known-game-profiles-from-a-catalog-and-detect-the-executable-after-import.md) Fill known game profiles from a catalog and detect the executable after import
- [011](011-make-add-idempotent-for-a-registered-game-that-is-not-installed.md) Make add idempotent for a registered game that is not installed
- [009](009-provision-a-game-end-to-end-when-it-is-added.md) Provision a game end to end when it is added
- [006](006-uninstall-from-the-tui-purges-the-prefix-and-forgets-the-game.md) Uninstall from the TUI purges the prefix and forgets the game

### opentui

- [008](008-keep-the-tui-at-the-full-viewport.md) Keep the TUI at the full viewport
- [007](007-size-the-tui-at-60-of-the-viewport-and-adapt-its-rows.md) Size the TUI at 60% of the viewport and adapt its rows
- [005](005-confirm-destructive-tui-actions-in-app-and-run-lifecycle-commands-non-interactiv.md) Confirm destructive TUI actions in-app and run lifecycle commands non-interactively
- [002](002-use-opentui-with-react-for-the-terminal-interface.md) Use OpenTUI with React for the terminal interface

### registry

- [012](012-fill-known-game-profiles-from-a-catalog-and-detect-the-executable-after-import.md) Fill known game profiles from a catalog and detect the executable after import
- [011](011-make-add-idempotent-for-a-registered-game-that-is-not-installed.md) Make add idempotent for a registered game that is not installed
- [006](006-uninstall-from-the-tui-purges-the-prefix-and-forgets-the-game.md) Uninstall from the TUI purges the prefix and forgets the game
- [001](001-unify-the-per-game-wrapper-repos-into-one-typescript-registry.md) Unify the per-game wrapper repos into one TypeScript registry

### add

- [012](012-fill-known-game-profiles-from-a-catalog-and-detect-the-executable-after-import.md) Fill known game profiles from a catalog and detect the executable after import
- [011](011-make-add-idempotent-for-a-registered-game-that-is-not-installed.md) Make add idempotent for a registered game that is not installed
- [009](009-provision-a-game-end-to-end-when-it-is-added.md) Provision a game end to end when it is added

## Operating rules

- Record a structural decision with `pix_tool_process_adr`, when it is taken.
- Never rewrite an accepted decision. Supersede it with a new one that says why.
- Never edit this file. Edit the ADR and let the next call regenerate it.
