# 014: Source game icons from the store the game came from

- **Date**: 2026-10-05
- **Status**: accepted
- **Tags**: icons, gog, stores
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The icon pipeline always walked the Steam CDN with profile.appid. GOG games have appid 0, and the GOG product API returns artwork as protocol-relative URLs (a leading double slash), which fetch rejects. add stored only a logo and a background in meta, so the icon command could never recover the artwork and every GOG game fell through to the placeholder.

## Decision

The store a game comes from decides its artwork source. The meta block caches the full GOG product images map when a game is added; gogIconCandidates orders icon then logo2x then logo then background and rewrites a bare double-slash host to https; provisionIcon branches on the store and, for GOG, skips the Steam CDN and SteamGridDB entirely. Older profiles without the cached map fall back to the stored library and header images mapped back onto their GOG keys.

## Consequences

GOG games get a real icon on add and on refresh, with no login needed. The icon source is a store concern rather than a Steam-only one, so a third store would add one branch and one candidate function. The cost is a wider game meta block and test coverage for the GOG branch.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Use SteamGridDB's GOG endpoints, which adds another API dependency for art GOG already serves.
1. Re-fetch the product with OAuth at icon-refresh time, which requires a live login for a read that can be cached at add time.
1. Try both CDNs unconditionally, which doubles the requests and 404 noise for every game.
