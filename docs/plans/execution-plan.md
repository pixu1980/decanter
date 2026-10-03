# Execution plan — `steam-mac` unified wrapper

Goal: replace the five per-game repos (`steam-mac-core`, `broken-sword-directors-cut`,
`graveyard-keeper-2`, `office-management-101`, `the-cosmic-wheel-sisterhood`) with a
single TypeScript repo that wraps **any** Windows-only Steam game into a native
`.app` on Apple Silicon: registry of games, automatic depot download (SteamCMD with
guided-console fallback), automatic icon, updates, lifecycle, and an OpenTUI
(@opentui/react) interface.

## Decisions taken (from the foundation interview)

- **Location**: nested repo `~/Projects/steam-mac/steam-mac`.
- **Stack**: full TypeScript rewrite (engine + CLI + TUI), pnpm, exact versions.
- **Depot download**: SteamCMD when configured, guided Steam-console fallback otherwise.
- **Game registry**: runtime only, `~/.steam-mac/games/<slug>/game.json`.
- **Icon**: auto from the Steam CDN, fallback to the icon embedded in the exe (icoutils).
- **TUI**: `@opentui/react`.
- **Legacy repos**: profiles migrated into the registry, repos archived then removed.
- **Build order**: all in parallel.

## Runtime layout (`~/.steam-mac`)

```
config.json                 global settings (steam root, steamcmd account, runtime defaults)
games/<slug>/game.json      per-game profile (Steam ids, paths, window mode, hooks)
games/<slug>/manifest       installed depot manifest id
games/<slug>/assets/        icon.png, icon.icns
wine/                       pinned Gcenx Wine builds (wine-devel / wine-staging)
steamcmd/                   downloaded SteamCMD
logs/                       CLI/TUI logs
```

## Phases

### Phase 1 — Foundation
- [x] `package.json`, `tsconfig.json`, `.npmrc`, `.gitignore`, `LICENSE`, `bin/steam-mac`
- [x] `src/core/paths.ts` (`~/.steam-mac` layout, `SM_HOME` override)
- [x] `src/core/log.ts`, `src/core/exec.ts` (dry-run aware process helpers)
- [x] `src/core/config.ts` (global config load/save)

### Phase 2 — Profile & registry
- [x] `src/core/profile.ts` (`game.json` schema, read/write, legacy `game.conf` importer)
- [x] `src/core/registry.ts` (list/get/add/remove games)
- [x] Unit tests for profile parse/serialize/legacy migration and registry

### Phase 3 — Steam integration
- [x] `src/core/store.ts` (storesearch/appdetails, icon candidates)
- [x] `src/core/steamcmd.ts` (install SteamCMD, login modes, `download_depot` parsing)
- [x] `src/core/depot.ts` (locate depot downloads, manifest ids, `rsync` import, update check)
- [x] Unit tests with mocked fetch/exec

### Phase 4 — Wine & app bundle
- [x] `src/core/wine.ts` (gptk / wine-devel / wine-staging resolution, provisioning, `wineboot`)
- [x] `src/core/icon.ts` (CDN fetch → `icon.png`/`icon.icns`, exe extraction fallback)
- [x] `src/core/bundle.ts` (`.app` with loader copy, symlinks, `Info.plist`, `launch`, icon)
- [x] Unit tests for Info.plist and candidate selection

### Phase 5 — Lifecycle
- [x] `src/core/lifecycle.ts` (`setup`, `import`, `download`, `update`, `run`, window mode, `status`, `doctor`, `logs`, `saves`, `mods`, `backup-saves`, `steam-setup`, `steam`, `uninstall`)
- [x] `src/core/migrate.ts` (legacy repo → registry)
- [x] Tests for manifest/update logic and dry-run lifecycles

### Phase 6 — CLI
- [x] `src/core/args.ts` (command + flags parsing)
- [x] `src/cli.ts` (dispatch, per-game commands, `list`/`add`/`remove`/`migrate`/`tui`)
- [x] `steam-mac help`, `version`

### Phase 7 — TUI (@opentui/react)
- [x] `src/tui.tsx` (renderer bootstrap, lifecycle)
- [x] `_App.tsx` + screens: Games, Game detail, Add wizard, Doctor, Logs, Settings
- [x] keyboard navigation, async actions, status line

### Phase 8 — Docs, migration, verification
- [x] `README.md`, `docs/architecture.md`, `docs/managing.md`
- [x] ADRs for structural decisions (pix_tool_process_adr)
- [x] `tsc --noEmit`, `node --test` (34 unit tests), OpenTUI render test
- [x] Migrate the four legacy profiles into `~/.steam-mac/games/`
- [x] Archive the legacy repos (`.archive/legacy-wrapper-repos-*.tar.gz` + git bundles), then remove the four per-game repos; `steam-mac-core` is kept on request
- [ ] Run the dev server per project convention (not applicable: no server)

## Verification status

- `pnpm typecheck`: clean.
- `pnpm test`: 34 tests, 0 failures.
- `pnpm test:tui`: 1 render test, 0 failures.
- `steam-mac list`, `status`, `doctor` run against the real machine and the four
  migrated games; `doctor broken-sword-directors-cut` passes every check.

## Notes

- The pix `pix_tool_fix` codemod must not be run again: it corrupted 39 files
  (it rewrote inside string literals). The files were restored by hand.
- `no-inline-styles` cannot be satisfied by a native TUI; OpenTUI styles through
  props and style objects and has no CSS layer. Recorded in ADR 002.
