# 009: Provision a game end to end when it is added

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: lifecycle, add, steamcmd
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

`add` only wrote the profile and left setup, download and import to the user, and SteamCMD was downloaded lazily on the first download. The request: adding a game must run setup automatically and then download and import, and SteamCMD must be part of the tool rather than something installed by hand.

## Decision

addGame writes the profile and the icon, then calls provisionGame, which runs cmdSetup (now installing SteamCMD through ensureSteamcmd), cmdDownload and cmdImport in order and re-provisions the icon at the end. When the depot id is missing the pipeline stops after setup with a message. The CLI keeps setup/download/import for retries, and download keeps its guided Steam-console fallback.

## Consequences

One command installs a game end to end and SteamCMD is provisioned by setup. Cost: add is now long-running and can fail mid-pipeline; the game stays registered and every step is idempotent. Under --dry-run the pipeline prints the plan only, because the profile is never written to disk.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Orchestrate the pipeline in the CLI and TUI call sites only, which is easy to forget
1. Ask before provisioning, which contradicts the requirement that setup always runs
