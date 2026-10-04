# 007: Size the TUI at 60% of the viewport and adapt its rows

- **Date**: 2026-10-03
- **Status**: superseded by [008](008-keep-the-tui-at-the-full-viewport.md)
- **Tags**: tui, opentui, layout
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The interface filled the whole terminal. The request was for it to occupy 60% of the viewport, centred. OpenTUI's createCliRenderer only honours an explicit width and height when stdout has no size, so the renderer itself stays full-terminal and the frame must be laid out inside the React tree.

## Decision

The app renders a centred frame of 60% width and 60% height, computed from the terminal dimensions. Components that need the frame width receive it as a prop because useTerminalDimensions reports the full terminal. Rows that would overflow adapt: the game list drops redundant state labels on frames narrower than 72 columns and truncates the name, and the status bar clips its message and hints to the available columns.

## Consequences

The interface reads as a window with breathing room and never overlaps text at 80 columns. Cost: some state labels are hidden on narrow frames, and every component that needs the frame width depends on a prop rather than the hook.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Pass width and height to createCliRenderer, which is ignored whenever stdout reports columns and rows
1. Use percentage styles on the frame without adapting the rows, which lets text overlap when the frame is narrow
