# 005: Confirm destructive TUI actions in-app and run lifecycle commands non-interactively

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: tui, opentui, interaction, safety
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The OpenTUI interface drives the same lifecycle commands as the CLI. cmdUninstall confirms through readline on process.stdin, but the native renderer owns the terminal, so the prompt never receives a line and the interface hangs. Colours were also hard-coded in every screen.

## Decision

Destructive actions confirm through an in-app dialog and the TUI runs them with yes: true, so no lifecycle command ever reads stdin under the renderer. A shared theme module owns the palette and a shared actions module owns the ordered action list and marks the destructive ones.

## Consequences

Uninstall no longer hangs and destructive actions look and behave consistently across screens. Cost: the TUI must never call an interactive engine command, and the engine's confirm() remains CLI-only.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Let the engine detect a non-TTY stdin and abort, which breaks piping a yes into the CLI
1. Spawn uninstall in a child process that owns a fresh TTY
1. Make --yes the default for every action and drop confirmation
