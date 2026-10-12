# 006: Uninstall from the TUI purges the prefix and forgets the game

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: tui, lifecycle, uninstall, registry
- **Author**: Emiliano Pisu <pisuemiliano.1980@gmail.com>

## Context

The game list is driven by the registry, so a game removed only at the bundle level kept its row forever. ADR 005 made the TUI run uninstall non-interactively but left the engine semantics unchanged: cmdUninstall removes the app bundle and keeps the Wine prefix, while the CLI `remove` command is the one that also forgets the record.

## Decision

The TUI's uninstall action runs cmdUninstall with purge: true and then removeGameRecord, so the app bundle, the Wine prefix and the registry record are all deleted and the row disappears after the reload. The CLI keeps the two separate commands: `uninstall` (keeps the prefix) and `remove` (forgets the record).

## Consequences

The list reflects reality after an uninstall. Cost: the TUI cannot uninstall while keeping the prefix, and saves and mods inside the prefix are destroyed - the in-app confirmation now says so explicitly.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Hide games without an app bundle from the list, which also hides freshly added games and breaks the add -> setup flow
1. Add a hidden flag to the profile and filter on it, adding state for no user benefit
