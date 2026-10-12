# 002: Use OpenTUI with React for the terminal interface

- **Date**: 2026-10-02
- **Status**: accepted
- **Tags**: tui, opentui, react
- **Author**: Emiliano Pisu <pisuemiliano.1980@gmail.com>

## Context

The tool needs an interface that is comfortable for adding, running, updating and removing many games, beyond a list of CLI subcommands. Node 26.4+ supports the FFI that OpenTUI's native renderer needs, and the project already targets React 19.

## Decision

Build the interface with @opentui/react. The engine stays UI-agnostic; _App.tsx owns routing and state and calls the same lifecycle functions as the CLI through safeAction.

## Consequences

A single keyboard-driven interface with Flexbox layout and no browser. Cost: OpenTUI styles components through props and style objects, so the pix web rules no-inline-styles and external CSS cannot be satisfied by a native TUI; this deviation is recorded here. The TUI needs node --experimental-ffi, added only for the TUI command by the launcher.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. @opentui/core imperative renderables
1. A gum/fzf shell interface
1. No interface, CLI only
