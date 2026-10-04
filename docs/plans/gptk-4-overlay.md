# Execution plan — opt-in Game Porting Toolkit (Apple DMG) runtime

Feature plan. The main project plan lives in `docs/plans/execution-plan.md`.

## Context

- The default `gptk` runtime provisions the Gcenx cask
  `gcenx/wine/game-porting-toolkit`, currently **3.0-3** (published 2026-03-03,
  Gcenx's latest), which carries **D3DMetal 3.0**.
- The wine64 binary prints `wine-7.7 (Game Porting Toolkit 1.1)`. That is a stale
  Apple string baked into the Wine build, not the GPTK/D3DMetal version. It is
  what `status` / `doctor` surface today, so a modern install reads as "1.1".
- Apple ships **Game Porting Toolkit 4.0** (paired with macOS 27) only from
  `developer.apple.com` behind an Apple ID. Gcenx has **no 4.0 package**, so
  there is no Homebrew cask to bump.
- Apple's DMG provides `redist/lib/` (D3DMetal framework + Wine Windows DLLs)
  and `gameportingtoolkit*` scripts, **but no macOS Wine loader**. A loader must
  come from an existing runtime (the Gcenx GPTK app, or a Gcenx
  `wine-devel` / `wine-staging` build).
- Goal: an **opt-in** `gptk-apple` runtime that overlays the D3DMetal from a
  user-supplied Apple DMG onto a Gcenx loader, plus honest version reporting.
  The default `gptk` path is unchanged.

## Evidence (recorded 2026-10-03)

- Installed cask: `gcenx/wine/game-porting-toolkit` **3.0-3**;
  `D3DMetal.framework` `CFBundleShortVersionString = 3.0`;
  `wine64 --version` → `wine-7.7 (Game Porting Toolkit 1.1)`.
- Gcenx releases: latest `Game-Porting-Toolkit-3.0-3`; no 4.0, not even a
  prerelease.
- `apple/game-porting-toolkit` GitHub repo carries skills/samples only — not the
  evaluation environment. GPTK 4 requires macOS 27 + Xcode 27.
- Apple DMG layout (documented for 2.1; to be re-confirmed for 4.0):
  volume `Evaluation environment for Windows games <version>`, containing
  `redist/lib/`, `gameportingtoolkit`, `gameportingtoolkit-no-hud`, `Read Me.rtf`.

## Files to change

- `src/core/wine.ts` — `gptk-apple` resolution, `d3dMetalVersion`, overlay provisioning
- `src/core/profile.ts`, `src/core/config.ts` — `gptk-apple` in the runtime union, `appleGptkDir`
- `src/core/paths.ts` — overlay app path
- `src/core/lifecycle.ts` — report the D3DMetal version in `status` / `doctor`
- `src/cli.ts` — help text for the new command/flag
- `tests/unit/*.test.ts` — version parsing and overlay tests
- `README.md`, `docs/architecture.md`, `docs/managing.md`, ADR

## Out of scope

- Automating the Apple-ID-gated DMG download.
- Building Apple's Wine from source.
- A TUI Settings field for `appleGptkDir` (proposed in prose only).
- Changing the default runtime away from `gptk`.

## Phases

### Phase 1 — Honest version reporting

- [x] `d3dMetalVersion(runtime)` in `src/core/wine.ts` via
      `plutil -extract CFBundleShortVersionString raw` on
      `lib/external/D3DMetal.framework/Versions/Current/Resources/Info.plist`
- [x] Surface it in the `ensureWine` log, `collectStatus` and `collectDoctor`
      (`runtimeVersion` → `D3DMetal 3.0 · wine-7.7`)
- [x] Unit test against a temp framework fixture (`tests/unit/wine.test.ts`)

### Phase 2 — Runtime model and config

- [x] Add `gptk-apple` to `WineRuntime` in `profile.ts` and to `Config` in `config.ts`
- [x] `appleGptkSource: string` (default `""`), documented in `docs/managing.md`
- [x] `paths.ts`: `appleGptkAppDir()` → `~/.steam-mac/wine/gptk-apple/Game Porting Toolkit.app`
- [x] `resolveWine`: `gptk-apple` uses that overlay app; env override
      `<PREFIX>_GPTK_APPLE_SOURCE` for the source DMG directory

### Phase 3 — Overlay provisioning

- [x] Gate: inventory the real GPTK 4.0 beta 2 DMG — volume
      `Evaluation environment for Windows games 4.0 beta 2`, `redist/lib/{external,wine}`,
      D3DMetal `4.0b2`, no Wine loader, no `gameportingtoolkit*` scripts
- [x] Locate `redist/lib` under `appleGptkSource` (no hardcoded volume name)
- [x] `ensureWine(gptk-apple)`: ensure the base Gcenx loader, APFS-clone it to the
      overlay app, then `ditto` the `redist/lib` subset over `.../wine/lib/`
      (merge, not Apple's wholesale `mv external/wine` — that drops the builtins)
- [x] Idempotent: skip when the overlay already matches the source D3DMetal version
- [x] Keeps an existing overlay when the DMG is not mounted; actionable `die` otherwise

### Phase 4 — CLI, docs, ADR

- [x] Configured through the existing `steam-mac config appleGptkSource=<dir>` and
      per-game `wineRuntime: "gptk-apple"` (no new command needed)
- [x] `docs/architecture.md`, `docs/managing.md`, `README.md`
- [x] ADR 013: overlay Apple's D3DMetal onto a Gcenx loader (`pix_tool_process_adr`)

### Phase 5 — Verification

- [x] `pnpm typecheck`, `pnpm test` (57/57), `pnpm test:tui`
- [x] Manual run: Graveyard Keeper 2 on `gptk-apple`; `doctor` shows
      `Game Porting Toolkit (Apple) — D3DMetal 4.0b2 · wine-7.7`. Game files were
      lost (see note) and need a re-download; the prefix and app bundle are rebuilt.
- [x] Confirm the default `gptk` path is untouched (overlay is a separate tree)

## Verification finding (2026-10-03): the overlay does not boot games

After the game files were re-downloaded and imported, GK2 aborted under
`gptk-apple`:

```
err:module:LdrInitializeThunk "d3d11.dll" failed to initialize, aborting
... Initializing dlls for L"C:\\GK2\\GraveyardKeeper2.exe" failed, status c0000142
```

The same game boots under the default `gptk` (D3DMetal 3.0, `wine-7.7`): Unity
initialises, creates a D3D11 device (`Renderer: AMD Compatibility Mode`) and
loads its assemblies. So the overlay's D3DMetal 4.0 bridge DLLs are incompatible
with the Gcenx Wine 7.7 loader; they need the matching Apple Wine build, which
Gcenx has not shipped. Overlaying onto a Gcenx `wine-devel` 11.18 build instead
falls back to wined3d/MoltenVK (no D3DMetal) and the game exits.

Outcome: GK2 stays on `wineRuntime: "gptk"`. The `gptk-apple` code and docs are
kept but marked non-functional until a compatible loader exists.

## Data-loss note (2026-10-03 16:57)

`~/.steam-mac/games/graveyard-keeper-2` and `~/Games/graveyard-keeper-2-prefix`
were both deleted while the user's `pnpm start` TUI was open (launched 16:46).
A controlled run of `pnpm test` and `pnpm test:tui` against a throwaway record
confirmed the suites do **not** touch the real home. The registry record was
restored by hand; the game files in the prefix were not recoverable and need a
re-download. Follow-up worth considering: make the TUI uninstall require the
prefix to exist and log the resolved paths before purging.
