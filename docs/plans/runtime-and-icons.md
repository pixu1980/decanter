# Plan — provider-aware icons + runtime inspection, upgrade and rollback

Goal: two independent features.

1. **Provider-aware icon fetch.** `icon.ts` must fetch artwork from GOG when a
   game comes from GOG, not only from the Steam CDN. Today the GOG URLs are
   protocol-relative (`//images-…gog-statics.com/…`), which `fetch` rejects, and a
   refresh (`cmdIcon`) never looks at GOG at all, so GOG games fall through to a
   placeholder.
2. **Runtime inspection, upgrade and rollback.** Show which Wine + Direct3D
   stack a game uses (e.g. `Game Porting Toolkit (Apple) · D3DMetal 4.0b2` or
   `Wine devel 11.18 · DX9 (native d3dx9)`), attempt an update to the newest
   available runtime, and roll back to the last runtime that worked.

## Phases

### Phase 1 — provider-aware icons
- [x] `gog.ts`: `gogIconCandidates(images)` ordered `icon → logo2x → logo → background`, normalizing `//host/…` to `https://host/…`.
- [x] `icon.ts`: `downloadGogArt()` + a `profile.store === "gog"` branch in `provisionIcon` that skips the Steam CDN / SteamGridDB.
- [x] `add.ts`: store the full `product.images` as `meta.gogImages`.
- [x] `actions.ts`: the icon hint no longer says "Steam CDN".
- [x] Tests: candidate order + URL normalization, `downloadGogArt` with a fake fetch.

### Phase 2 — runtime inspection
- [x] `profile.ts`: `RuntimeSnapshot` + `runtimeHistory` (bounded, default `[]`).
- [x] `wine.ts`: `runtimeDetails(runtime, profile)` (`label · D3DMetal x` / `label · DX9 (native d3dx9)`), `latestWineVersion(flavor)` from the Gcenx GitHub releases.
- [x] `lifecycle.ts`: `collectRuntime(slug)`, `cmdRuntime(slug)`, record a snapshot on `setup` and `run`.
- [x] `status`/`doctor` show the detailed runtime summary.
- [x] TUI: a `Runtime` action that opens a read-only `RuntimeView` (fields + history).

### Phase 3 — upgrade and rollback
- [x] `lifecycle.ts`: `cmdRuntimeUpgrade(slug)` — newest Gcenx `wine-devel`/`wine-staging`, D3DMetal overlay rebuild for `gptk-apple`, Apple DMG switch or Homebrew upgrade for `gptk`; rebuild the bundle after the change.
- [x] `lifecycle.ts`: `cmdRuntimeRollback(slug)` — restore the newest recorded snapshot that differs from the current runtime.
- [x] CLI: `runtime`, `runtime-upgrade`, `runtime-rollback` commands.
- [x] TUI: `Upgrade runtime` and `Roll back runtime` actions.
- [x] Tests: `runtimeDetails`, `latestWineVersion`, `runtimeHistory` default.

### Phase 4 — docs and verification
- [x] `README.md`, `docs/architecture.md`, `docs/managing.md`.
- [x] ADR for the provider-aware icon source and the runtime rollback model.
- [x] `pnpm typecheck`, `pnpm test`, `pnpm test:tui`.
