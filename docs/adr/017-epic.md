# 017: epic

_Consolidated at the feature close from 7 decisions of this feature (017, 018, 019, 020, 021, 022, 023). Each decision is reproduced in full below._

---

<!-- source: docs/adr/017-add-epic-games-as-a-third-store-through-the-buildpatch-manifest.md -->

# 017: Add Epic Games as a third store through the BuildPatch manifest

- **Date**: 2026-10-05
- **Status**: accepted
- **Tags**: epic, stores, download
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

Steam downloads through SteamCMD and GOG through the Galaxy content system; both resolve a build, read a manifest and fetch content addressed by hash. Epic owns a third of the games a Mac player wants and the store was the next integration. Its content is a binary BuildPatch manifest plus hashed chunks, so the download protocol does not exist in the codebase yet.

## Decision

Epic is a third value of the store field and a new epic module that mirrors gog. Auth is OAuth with the public launcher client (browser plus a pasted authorization code, tokens under the decanter home). Entitlements, the catalog and the build resolve through the launcher and catalog hosts. The manifest is parsed with a faithful port of legendary's format (header magic, zlib body, metadata, chunk data list, file manifest list) and chunks are fetched from the build CDN bases, inflated and verified by SHA-1. add, download, import, icon, the catalog, Lutris, the CLI and the TUI all gain one branch, no rewrite. Launching stays offline first: a build runs like a GOG build, and the Epic-authenticated launch arguments and the EOS overlay are a second step.

## Consequences

A third store reuses the entire pipeline and the store stays a parameter, so a fourth store is the same shape. The cost is a binary manifest parser and a chunk downloader that must track Epic's versions and kinds, and encrypted manifests are rejected until their per-build secret is wired. The launch-arguments path is deliberately deferred so single-player titles work first.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Shell out to the legendary Python package, which adds a Python runtime and a second package manager to a TypeScript tool.
1. Support only the offline installers, which Epic does not publish for most titles.
1. Wait for a stable public Epic API, which does not exist.

---

<!-- source: docs/adr/018-collapse-catalog-rows-by-store-and-title-and-window-the-catalog-list.md -->

# 018: Collapse catalog rows by store and title and window the catalog list

- **Date**: 2026-10-06
- **Status**: accepted
- **Tags**: tui, catalog, stores, opentui
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

buildCatalog merged the three stores' libraries verbatim. Epic returns several entitlements for one title (base game plus editions, and the same record across pages), so the catalog showed 15 Train Sim World rows and 33 rows titled Live. The TUI rendered every entry in a flex column inside a fixed-height panel, so a long list overflowed and the rows overlapped.

## Decision

buildCatalog keeps one row per store and title (case-insensitive), preferring an entry that is already registered, and epicOwnedGames drops repeated app names at the source. The catalog view renders only a window of rows around the selection, sized from the terminal height in the app shell, and shows the visible range in the panel footer.

## Consequences

The catalog drops from 691 to 633 rows with no duplicate titles, Train Sim World to its four distinct editions and Live to one row. The window guarantees the panel never overflows and the selected row stays visible, at the cost of a page size the app shell has to estimate from the terminal height; a slightly wrong estimate clips a row rather than overlapping.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Render the whole list and rely on the panel's overflow: hidden, which is what produced the overlap.
1. Deduplicate by store and id only, which removes the repeated app names but leaves the editions.
1. Use the OpenTUI scrollbox renderable, which adds a ref plus scroll-into-view plumbing for a list the app already drives by index.

---

<!-- source: docs/adr/019-show-only-games-in-the-catalog-group-them-across-stores-and-give-installs-a-scre.md -->

# 019: Show only games in the catalog, group them across stores, and give installs a screen

- **Date**: 2026-10-06
- **Status**: accepted
- **Tags**: tui, catalog, stores
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The catalog listed every app the Steam library cache had seen, so tools (Steam Linux Runtime, dedicated servers, the 360 Video Player), DLC, soundtracks and demos sat next to real games. A game owned on two stores appeared twice with no way to pick the store, and an install streamed into the bottom activity panel without saying what was being installed.

## Decision

The catalog keeps games only: the Steam appinfo parser now reads common.type and steamCatalogEntries drops anything that is not Game. buildCatalog groups the stores' rows into one CatalogGame per title (case and punctuation insensitive), keeping one entry per store, so a cross-store game is one row that opens a store picker before installing. Installing pushes an Install view that shows the resolved game, store and id and streams the engine output, then returns to the games list with the new game selected.

## Consequences

The catalog drops the tools and noise (Steam 275 rows to 128 games) and shows one row per game (466 games, 20 owned on more than one store). The player chooses the store instead of the tool guessing, and an install is visible as its own screen. The cost is a title match that is heuristic across stores: two differently-named releases of one game stay separate rows.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Filter at list time too, which would hide the tools a user may want when debugging a store.
1. Group by a store-specific stable id, which does not exist across Steam, GOG and Epic.
1. Keep the bottom activity panel for installs, which shows progress without the game and store context.

---

<!-- source: docs/adr/020-install-the-rosetta-far-return-wow64cpu-dll-for-gcenx-wine-runtimes.md -->

# 020: Install the Rosetta far-return wow64cpu.dll for Gcenx Wine runtimes

- **Date**: 2026-10-07
- **Status**: accepted
- **Tags**: wine, runtime, macos, rosetta, wow64
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

Wine's new WoW64 runs 32-bit games inside a 64-bit process and switches the CPU between 32-bit and 64-bit mode with far jumps (ljmp *m16:32) on every system call. Rosetta 2 on Apple Silicon sometimes does not change modes on a far jump, so the 64-bit syscall_32to64 thunk runs as 32-bit code and faults; the faulting instruction reads cs32_sel relative to RIP and decodes to a small constant address such as 0x2EC5. The crash lands in wow64cpu.dll (or the 32-bit ntdll.dll thunk beside it) and kills 32-bit games intermittently, at D3D device creation or when a mission loads. It affects every Gcenx wine-devel / wine-staging build (11.0 through 11.18) and cannot be escaped with GPTK, whose Wine 7.7 uses the old WoW64 but asserts in virtual.c (alloc_pages_vprot) on the same class of game. The Settlers II - 10th Anniversary (GOG) reproduced it on wine-devel 11.17 and 11.18.

## Decision

Add src/core/wow64.ts and call installRosettaWow64Fix from cmdSetup after wineboot, for wine-devel / wine-staging runtimes on arm64 only. It downloads a community prebuilt wow64cpu.dll rebuilt to use far returns instead of far jumps, verifies its SHA-256 against a pinned digest keyed by Wine version (ROSETTA_WOW64_FIX), caches it under the decanter wine directory, and copies it into both the runtime (lib/wine/x86_64-windows/wow64cpu.dll) and the prefix (drive_c/windows/system32/wow64cpu.dll), keeping the originals as .orig. Both copies are patched because Wine loads the DLL from the prefix and wineboot copies it there from the runtime. The prebuilt is pinned to a repository commit and its digest, so a moving target cannot change what the checksum proves. When a version has no prebuilt the step warns and continues, so setup never fails on an unknown runtime.

## Consequences

32-bit Gcenx Wine games stop crashing in wow64cpu.dll: The Settlers II ran six consecutive clean launches (plain and through the app bundle, with the virtual desktop) and passed D3D device creation every time, where it previously faulted about one run in three. The fix is idempotent and offline after the first download, and the .orig copies make it reversible. Costs: the repository now depends on a third-party prebuilt DLL (pinned by commit and SHA-256, LGPL, source and patch published upstream), the fix only exists for the versions listed in ROSETTA_WOW64_FIX, and the catalog pins The Settlers II to 11.18 so the version has a prebuilt.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Pin Wine 11.17 and hope it is more stable: tested, it still faulted, and the doc's earlier claim that 11.17 avoids the bug was wrong.
1. Use GPTK's Wine 7.7 (old WoW64): it asserts in virtual.c (alloc_pages_vprot) on this class of 32-bit game.
1. Build the patched wow64cpu.dll from the Wine source at setup time: needs mingw-w64 and a Wine source download, a heavy dependency for a 15 KB DLL.
1. Wait for an upstream Wine fix: the workaround is not upstream (only Sikarugir's fork carries it), so the game would stay broken indefinitely.

---

<!-- source: docs/adr/021-close-out-plan-epic-support.md -->

# 021: Close out plan epic-support

- **Date**: 2026-10-12
- **Status**: accepted
- **Tags**: docs, closeout, plan
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The plan record docs/plans/epic-support.md, "Epic Games Store support — feasibility study", finished with 10 resolved items.

## Decision

Fold the record into this ADR and the session handoff, then delete the source file. The full text stays in git history.

## Consequences

docs/plans/epic-support.md is gone from the tree; the handoff of this session names what it carried.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

---

<!-- source: docs/adr/022-close-out-plan-gptk-4-overlay.md -->

# 022: Close out plan gptk-4-overlay

- **Date**: 2026-10-12
- **Status**: accepted
- **Tags**: docs, closeout, plan
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The plan record docs/plans/gptk-4-overlay.md, "Execution plan — opt-in Game Porting Toolkit (Apple DMG) runtime", finished with 18 resolved items.

## Decision

Fold the record into this ADR and the session handoff, then delete the source file. The full text stays in git history.

## Consequences

docs/plans/gptk-4-overlay.md is gone from the tree; the handoff of this session names what it carried.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

---

<!-- source: docs/adr/023-close-out-plan-runtime-and-icons.md -->

# 023: Close out plan runtime-and-icons

- **Date**: 2026-10-12
- **Status**: accepted
- **Tags**: docs, closeout, plan
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The plan record docs/plans/runtime-and-icons.md, "Plan — provider-aware icons + runtime inspection, upgrade and rollback", finished with 18 resolved items.

## Decision

Fold the record into this ADR and the session handoff, then delete the source file. The full text stays in git history.

## Consequences

docs/plans/runtime-and-icons.md is gone from the tree; the handoff of this session names what it carried.

## What would end this

The assumption this leans on, and the observation that would make it wrong.
