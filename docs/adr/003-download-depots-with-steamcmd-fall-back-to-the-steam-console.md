# 003: Download depots with SteamCMD, fall back to the Steam console

- **Date**: 2026-10-02
- **Status**: accepted
- **Tags**: steam, steamcmd, download
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The legacy flow always asked the user to type download_depot in the Steam console and then import. It works but is manual, and it needs the native Steam client running.

## Decision

download runs SteamCMD with +@sSteamCmdForcePlatformType windows +download_depot, which fetches the Windows depot headlessly. Anonymous works for free games; a stored login serves owned games. When SteamCMD cannot help, the command opens the Steam console, guides the user and watches the depot folder until the download finishes.

## Consequences

Owned games download without touching the Steam client once logged in, and free games need no login. Cost: SteamCMD is a ~200MB install, first use bootstraps it, and accounts without the app still fall back to the guided flow.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Steam console only, as before
1. SteamCMD only, no fallback
1. Use the Windows Steam client + app_update inside the prefix
