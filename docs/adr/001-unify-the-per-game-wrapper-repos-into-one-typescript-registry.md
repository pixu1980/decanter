# 001: Unify the per-game wrapper repos into one TypeScript registry

- **Date**: 2026-10-02
- **Status**: accepted
- **Tags**: architecture, registry, typescript
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

Five repos existed: steam-mac-core held a battle-tested zsh engine, and four per-game repos held only a game.conf, a thin wrapper, an icon and docs. Adding a game meant cloning and editing a repo, and the shared engine could only run one game per repo.

## Decision

Replace all five with a single TypeScript repo, steam-mac. Games become runtime data: steam-mac add writes ~/.steam-mac/games/<slug>/game.json, and every command resolves a game from that registry. The engine, the CLI and the OpenTUI interface live in the same program.

## Consequences

One place to add, run, update and remove any game, no clone per game. Cost: the proven zsh engine was rewritten in TypeScript and must be re-verified, and the legacy repos were migrated then archived.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Keep zsh engine and add a TypeScript frontend that shells out
1. Keep one repo per game and vendor the core
1. Ship game profiles inside the repo instead of a runtime registry
