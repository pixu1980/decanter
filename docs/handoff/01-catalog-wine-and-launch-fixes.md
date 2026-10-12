# Session handoff — catalog grouping, Wine wow64 fix and launch recovery

- **Branch**: `feat/epic`
- **Commit range covered**: `46dfbba1b3388e53cc7f8c236869f604c2b1d000..32969d3` (24 feature commits; the six newest are this session)
- **Date**: 2026-10-12

## HANDOFF: decanter

### Project Identity
- Description: Wrap any Windows-only Steam game into native macOS.app (Wine + D3DMetal), with CLI and OpenTUI interface.
- Version: 0.1.0

### Feature Range

- Base: `main` (merge base `46dfbba1b3388e53cc7f8c236869f604c2b1d000`)
- Range: `46dfbba1b3388e53cc7f8c236869f604c2b1d000..HEAD` (24 commit(s))
- Conventional Commit violations: 0

### Work This Session (6 commits)

- `5125e6c` `feat(catalog)` — the Steam appinfo parser reads `common.type`; `steamCatalogEntries` drops anything that is not a `Game`; `buildCatalog` groups the stores' rows into one `CatalogGame` per title; `epicOwnedGames` deduplicates repeated entitlements.
- `1e5ee5b` `feat(tui)` — the catalog renders only a window of rows around the selection, lists every store a game is owned on, opens a store picker when a game is owned more than once, and runs installs on a dedicated Install screen.
- `7a3cfff` `feat(wine)` — `src/core/wow64.ts` installs the Rosetta far-return `wow64cpu.dll` for Gcenx `wine-devel` / `wine-staging` runtimes on arm64; `cmdSetup` calls it after `wineboot`; The Settlers II is pinned to 11.18.
- `688dbda` `fix(launch)` — `cmdRun` stops the prefix's Wine processes and retries `open` once on error -1712; `cmdQuit` counts an open app bundle as running; `isGameRunning` matches the game executable, not any Wine process.
- `3121ace` `fix(bundle)` — `bundleName` / `appBundleName` sanitize the `.app` name for macOS (`:` → ` - `, symbols dropped); rebuilding removes the legacy unsanitized bundle.
- `32969d3` `docs(adr)` — ADRs 018–020, plan closeouts 021–023, and the README / managing / troubleshooting updates.

### ADR Log

| # | Status | Title | Tags |
|---|--------|-------|------|
| 023 | accepted | Close out plan runtime-and-icons | docs, closeout, plan |
| 022 | accepted | Close out plan gptk-4-overlay | docs, closeout, plan |
| 021 | accepted | Close out plan epic-support | docs, closeout, plan |
| 020 | accepted | Install the Rosetta far-return wow64cpu.dll for Gcenx Wine runtimes | wine, runtime, macos, rosetta, wow64 |
| 019 | accepted | Show only games in the catalog, group them across stores, and give installs a screen | tui, catalog, stores |
| 018 | accepted | Collapse catalog rows by store and title and window the catalog list | tui, catalog, stores, opentui |
| 017 | accepted | Add Epic Games as a third store through the BuildPatch manifest | epic, stores, download |
| 016 | accepted | Rename the project to Decanter and keep all data under one home | naming, paths, layout |
| 015 | accepted | Record a runtime snapshot per launch and roll back to the previous runtime | wine, runtime, rollback |
| 014 | accepted | Source game icons from the store the game came from | icons, gog, stores |
| 013 | accepted | Overlay Apple GPTK 4 D3DMetal onto the Gcenx loader for the gptk-apple runtime | wine, runtime, macos |
| 012 | accepted | Fill known game profiles from a catalog and detect the executable after import | add, registry, lifecycle |
| 011 | accepted | Make add idempotent for a registered game that is not installed | add, registry, lifecycle |
| 010 | accepted | Resolve missing icons through a fallback chain with SteamGridDB and a placeholder | icons, steamgriddb, assets |
| 009 | accepted | Provision a game end to end when it is added | lifecycle, add, steamcmd |
| 008 | accepted | Keep the TUI at the full viewport | tui, opentui, layout |
| 007 | superseded | Size the TUI at 60% of the viewport and adapt its rows | tui, opentui, layout |
| 006 | accepted | Uninstall from the TUI purges the prefix and forgets the game | tui, lifecycle, uninstall |
| 005 | accepted | Confirm destructive TUI actions in-app and run lifecycle commands non-interactively | tui, opentui, interaction |
| 004 | accepted | Resolve the Wine runtime per game (GPTK or a pinned Gcenx build) | wine, runtime, macos |
| 003 | accepted | Download depots with SteamCMD, fall back to the Steam console | steam, steamcmd, download |
| 002 | accepted | Use OpenTUI with React for the terminal interface | tui, opentui, react |
| 001 | accepted | Unify the per-game wrapper repos into one TypeScript registry | architecture, registry, typescript |

### Closeout

- Archived `docs/plans/epic-support.md` → ADR 021 (`021-close-out-plan-epic-support.md`); source deleted.
- Archived `docs/plans/gptk-4-overlay.md` → ADR 022 (`022-close-out-plan-gptk-4-overlay.md`); source deleted.
- Archived `docs/plans/runtime-and-icons.md` → ADR 023 (`023-close-out-plan-runtime-and-icons.md`); source deleted.

### Recent Commits

```
32969d3 docs(adr): record the catalog, wine and bundle decisions
3121ace fix(bundle): sanitize the app bundle name for macOS
688dbda fix(launch): recover from open error -1712 and detect the open bundle
7a3cfff feat(wine): install the Rosetta far-return wow64cpu fix
1e5ee5b feat(tui): add the catalog window, store picker and install screen
5125e6c feat(catalog): show only games and group them across stores
4530d3f feat(tui): a unified local catalog across the three stores
48a5a02 feat(list): cache each store's library and refresh on demand
```

### Verification

- `pnpm typecheck` — clean.
- `pnpm test` — 141 unit tests pass.
- `pnpm test:tui` — 14 TUI tests pass.
- Working tree clean; every commit local, nothing pushed.

### Open Work

- `docs/plans/execution-plan.md`, `docs/plans/gog-implementation.md` and `docs/plans/gog-support.md` are still open and were not part of this closeout.
- The feature was closed with `pix_tool_git squash` (see the session log); verify the resulting commit on `feat/epic` before merging to `main`.

### Resume Prompt

```prompt
Resume work on decanter. Read docs/handoff/01-catalog-wine-and-launch-fixes.md and run `pix_tool_handon` first: it checks which claims in this handoff still hold before any of them are trusted.
The ADR log and the context snapshot capture what has been decided; do not re-ask answered questions.
Every commit is `type(scope): subject`; the commit-msg hook rejects a scope-less message.
First step: confirm the closed feature commit on `feat/epic` (squashed from 46dfbba) and review the open plans — docs/plans/execution-plan.md, docs/plans/gog-implementation.md and docs/plans/gog-support.md — then pick the next workstream before merging to `main`.
```
