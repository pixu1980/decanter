# 015: Record a runtime snapshot per launch and roll back to the previous runtime

- **Date**: 2026-10-05
- **Status**: accepted
- **Tags**: wine, runtime, rollback
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

A game runs on the Game Porting Toolkit, its Apple D3DMetal overlay or a pinned Gcenx Wine build. Upgrading any of them can break a game that used to run, and the profile only remembered the single current setting, so there was no supported way back. The tool also had no single readable answer to which Wine plus Direct3D stack a game actually uses.

## Decision

Every setup and launch records a RuntimeSnapshot (runtime name, pinned Wine version, D3DMetal version, timestamp) in the profile runtime history, deduplicated against the last entry and bounded to ten. runtimeDetails derives the one-line stack from the runtime on disk, reporting D3DMetal when the framework is present, native DX9 when the profile carries the d3dx9 verb, and WineD3D otherwise. The runtime-upgrade command advances a pinned Wine flavor to the newest Gcenx release, re-overlays the newer D3DMetal for the Apple runtime, or switches the default runtime to that overlay, then rebuilds the app bundle. The runtime-rollback command restores the most recent recorded runtime that differs from the current one.

## Consequences

A newer runtime is one command away, and a misbehaving one is one command back for any runtime the tool can re-provision. The history is small, needs no extra files, and doubles as the runtime view. Rollback cannot restore a D3DMetal version that its source no longer provides, and the default GPTK can only be rolled forward or switched to the Apple overlay; both limits are reported instead of hidden.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Keep an APFS clone of the previous runtime app, which doubles runtime storage and still cannot undo a Homebrew cask upgrade cleanly.
1. Rely on Homebrew to downgrade the cask, which is not supported for versioned casks.
1. Snapshot and restore the whole Wine prefix, which is heavy and does not address the runtime binary.
