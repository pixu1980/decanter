# 004: Resolve the Wine runtime per game (GPTK or a pinned Gcenx build)

- **Date**: 2026-10-02
- **Status**: accepted
- **Tags**: wine, runtime, macos
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

GPTK carries D3DMetal for Direct3D but bundles Wine 7.7, whose memory manager asserts on some 32-bit OpenGL games. Homebrew's Wine casks are disabled by Gatekeeper and conflict with GPTK.

## Decision

wineRuntime selects gptk (default) or wine-devel / wine-staging. setup provisions the gptk cask through Homebrew, or downloads the pinned Gcenx tarball (wineVersion) into ~/.steam-mac/wine. The app bundle copies whichever loader exists and skips the preloader when absent.

## Consequences

Games GPTK cannot run now work, with a pinned reproducible runtime and no cask conflict. Cost: a one-time download and a manual wineVersion bump to update.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Depend on GPTK only
1. Install a Wine cask from Homebrew
1. Vendor a Wine runtime per game
