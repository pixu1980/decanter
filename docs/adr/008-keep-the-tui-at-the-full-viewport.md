# 008: Keep the TUI at the full viewport

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: tui, opentui, layout
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

ADR 007 shrank the interface to a centred frame of 60% width and height, which forced compact rows, truncated names and clipped status hints to avoid overlap. In practice the smaller frame read worse than the full terminal: less room for the game list, the status bar and the log, for no benefit on a normal terminal.

## Decision

The interface fills the whole terminal again, as it did before ADR 007. The app root is a single full-size column and the components no longer receive a frame width: GameList and StatusBar drop their compact and clipping paths, GameDetail reads useTerminalDimensions again, and ConfirmDialog and HelpOverlay return to their fixed widths.

## Consequences

The list, the status bar and the logs use every available column and the code loses the prop plumbing ADR 007 introduced. Cost: on very narrow terminals (under roughly 72 columns) the game row and the status hints can wrap instead of truncating.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Keep the 60% frame and only relax it on narrow terminals, which keeps two layout paths alive for a default nobody wants
