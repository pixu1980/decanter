# 010: Resolve missing icons through a fallback chain with SteamGridDB and a placeholder

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: icons, steamgriddb, assets
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The icon came from the Steam library art and then the executable. Games the store dropped had no icon until the depot was imported, and some never got one at all. The request: when the artwork is not on Steam it must be downloaded elsewhere.

## Decision

provisionIcon tries the Steam store art, then SteamGridDB (square icons first, then vertical grids, filtered to the image types sips can read), then the smaller Steam artwork (logos and capsules), then the icon embedded in the executable, then a placeholder generated from the game's initial with a built-in 3x5 bitmap font. SteamGridDB uses the steamGridDbKey value in config. The icon is re-provisioned after import so a better source can replace the placeholder.

## Consequences

Almost every game gets an icon, including offline ones. Cost: a third-party API key in config, an extra network call per icon, and a small BMP encoder plus bitmap font kept in icon.ts.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Keep the executable-only fallback, which leaves a game without an icon until the depot is imported
1. Add an image library as a dependency to draw the placeholder, which is heavy for one generated image
