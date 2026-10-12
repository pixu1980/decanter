# 012: Fill known game profiles from a catalog and detect the executable after import

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: add, registry, lifecycle, profile
- **Author**: Emiliano Pisu <pisuemiliano.1980@gmail.com>

## Context

add builds every profile with normalizeProfile, whose exe default is <slug>.exe. For Graveyard Keeper 2 that produced graveyard-keeper-2.exe, while the depot ships GraveyardKeeper2.exe, so the generated .app launched Wine with a missing file and exited immediately. The legacy per-game repos carried these values in game.conf; the unified repo had no equivalent and the TUI wizard never asked for an executable.

## Decision

A built-in catalog (src/core/catalog.ts, keyed by appid) pre-fills the profile fields the Steam store cannot supply (exe, install/save subfolders, manifest name, save patterns, version pattern, Unity window registry block). add merges catalog then explicit flags, so --exe/--slug/--depot win. For games without an entry, after import the engine runs detectExecutable (src/core/exe.ts): a normalized name match against the game, otherwise the largest .exe, ignoring crash handlers and installers. When the configured exe is missing it rewrites game.json, saves it and rebuilds the app bundle.

## Consequences

Graveyard Keeper 2 is provisioned correctly with no flags and any other game gets a usable exe automatically. Cost: a catalog to maintain, and detection runs on every import that finds the configured exe missing. Detection is top-level only; games whose exe lives in a subfolder still need a hand-edited game.json.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Keep requiring --exe on the CLI, which the TUI wizard cannot provide and which the README never mentioned
1. Detect the executable only (no catalog), which loses save folders and window-mode data the store does not expose
1. Parse the standalone gravemac-keeper-2 gk2.sh constants, which couples the engine to a specific wrapper
