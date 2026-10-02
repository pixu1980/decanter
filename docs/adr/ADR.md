# Architecture Decision Records

Every decision this project has taken, newest first. The numbered files in
this directory are the source of truth; this index is generated from them by
`pix_tool_process_adr`, so editing it by hand is work the next call throws away.

## Index

| #                                                                            | Title                                                            | Date       | Status   | Tags                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------- | -------- | ---------------------------------- |
| [004](004-resolve-the-wine-runtime-per-game-gptk-or-a-pinned-gcenx-build.md) | Resolve the Wine runtime per game (GPTK or a pinned Gcenx build) | 2026-10-02 | accepted | wine, runtime, macos               |
| [003](003-download-depots-with-steamcmd-fall-back-to-the-steam-console.md)   | Download depots with SteamCMD, fall back to the Steam console    | 2026-10-02 | accepted | steam, steamcmd, download          |
| [002](002-use-opentui-with-react-for-the-terminal-interface.md)              | Use OpenTUI with React for the terminal interface                | 2026-10-02 | accepted | tui, opentui, react                |
| [001](001-unify-the-per-game-wrapper-repos-into-one-typescript-registry.md)  | Unify the per-game wrapper repos into one TypeScript registry    | 2026-10-02 | accepted | architecture, registry, typescript |

## What each decision says

The opening sentence of each decision and of what it cost, lifted from the
file. Where a line stops short the rest is in the ADR.

| ADR                                                                          | Decision                                                                                                                                                                                      | Consequence                                                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [004](004-resolve-the-wine-runtime-per-game-gptk-or-a-pinned-gcenx-build.md) | wineRuntime selects gptk (default) or wine-devel / wine-staging. setup provisions the gptk cask through Homebrew, or downloads the pinned Gcenx tarball (wineVersion) into ~/.steam-mac/wine. | Games GPTK cannot run now work, with a pinned reproducible runtime and no cask conflict.             |
| [003](003-download-depots-with-steamcmd-fall-back-to-the-steam-console.md)   | download runs SteamCMD with +@sSteamCmdForcePlatformType windows +download_depot, which fetches the Windows depot headlessly.                                                                 | Owned games download without touching the Steam client once logged in, and free games need no login. |
| [002](002-use-opentui-with-react-for-the-terminal-interface.md)              | Build the interface with @opentui/react.                                                                                                                                                      | A single keyboard-driven interface with Flexbox layout and no browser.                               |
| [001](001-unify-the-per-game-wrapper-repos-into-one-typescript-registry.md)  | Replace all five with a single TypeScript repo, steam-mac.                                                                                                                                    | One place to add, run, update and remove any game, no clone per game.                                |

## By theme

Tags carried by 3 or more decisions. A decision appears under every
theme it carries, and the early ADRs that predate the tag field are listed last.

## Operating rules

- Record a structural decision with `pix_tool_process_adr`, when it is taken.
- Never rewrite an accepted decision. Supersede it with a new one that says why.
- Never edit this file. Edit the ADR and let the next call regenerate it.
