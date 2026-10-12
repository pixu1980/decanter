# 011: Make add idempotent for a registered game that is not installed

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: add, registry, lifecycle
- **Author**: Emiliano Pisu <pisuemiliano.1980@gmail.com>

## Context

addGame died with "'<slug>' is already in the registry — pass --force to overwrite" whenever the slug existed, even after the game had been uninstalled, so the user could not re-add it to reinstall. The registry and the game list are driven by the same profile, so an uninstalled game that is still registered shows up as "not installed".

## Decision

addGame checks whether the existing game is installed through gameInstalled and the resolved paths. When it is installed the command is a no-op that says so, and --force re-registers it. When it is not installed the command re-provisions the game and refreshes the profile instead of failing.

## Consequences

Re-adding an uninstalled game reinstalls it, and an installed game is never re-downloaded by accident. Cost: add now reads the config and resolves paths to decide, and the profile is rewritten on a re-add.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Drop the guard entirely, which silently re-downloads an already installed game
1. Keep the error and document --force, which is exactly the friction being reported
