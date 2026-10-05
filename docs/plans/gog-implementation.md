# Execution plan — GOG.com support (`feat/gog`)

Feature plan. Study: `docs/plans/gog-support.md`. Design chosen by the user:
**B (Galaxy content-system) primary → A (offline installer) fallback → BYOI
(bring your own installer) fallback.**

## Files to change

- `src/core/profile.ts` — `store: "steam" | "gog"`, `gogId?: number`
- `src/core/config.ts` — `gog` account block (optional)
- `src/core/paths.ts` — `~/.steam-mac/gog/` (tokens, downloads)
- `src/core/gog.ts` — new: auth, tokens, owned games, product, installers, builds, manifests, secure link, download
- `src/core/lifecycle.ts` — `download`/`import` branch on `store`
- `src/cli.ts`, `src/tui/` — `gog login`, status/doctor
- `docs`, ADR, tests

## Protocol (from the reference `gogdl`)

- Auth: `GET auth.gog.com/token?client_id=REDACTED&client_secret=…&grant_type=authorization_code&redirect_uri=…&code=<code>`; refresh with `grant_type=refresh_token`.
- Owned: `GET embed.gog.com/user/data/games` → `{ owned: [id…] }`.
- Product: `GET api.gog.com/products/<id>?expand=downloads`.
- Builds: `GET content-system.gog.com/products/<id>/os/windows/builds?generation=2` → `items[].link` (zlib meta).
- Build meta (zlib): `baseProductId`, `installDirectory`, `depots[].manifest`.
- Depot manifest (zlib): `gog-cdn-fastly.gog.com/content-system/v2/meta/<galaxy_path(manifest)>` → `depot.items[]` (`DepotFile` with `chunks[{md5,size}]`, `DepotDirectory`, `DepotLink`).
- Chunk: `GET content-system.gog.com/products/<id>/secure_link?_version=2&generation=2&path=/` → `urls[]` (`url_format` + `parameters`); append `/<galaxy_path(compressed_md5)>` to `parameters.path`, fill the template, download the **zlib** chunk, verify the compressed md5, concatenate the decompressed parts.
- `galaxy_path(md5)` = `md5[0:2]/md5[2:4]/md5`.

## Phases

### Phase 1 — Foundation
- [ ] `profile.ts`: `store` (default `steam`) + `gogId`; keep `appid`/`depot` for Steam
- [ ] `paths.ts`: `gogDir()`, `gogAuthPath()`, `gogDownloadsDir(slug)`
- [ ] `gog.ts`: constants, `gogLoginUrl`, `gogExchangeCode`, `gogRefresh`, token load/save/ensure
- [ ] `gog.ts`: `gogOwnedGames`, `gogProduct`, `gogInstallers`, `gogBuilds`, `gogSecureLink`
- [ ] unit tests for URL building and token JSON

### Phase 2 — Design B (content-system download)
- [ ] `parseBuildMeta`, `parseDepotManifest`, `galaxyPath`, `chunkUrl` (pure, tested)
- [ ] `downloadBuild(id, dest, { onProgress })`: pick the newest Windows build, walk depots/files/chunks, write files, create dirs/symlinks
- [ ] `download`/`import` for `store: gog`

### Phase 3 — Design A (offline installer) fallback
- [ ] `gogInstallers` → download `setup_*.exe` + `.bin`
- [ ] run the installer in the prefix (`wine setup.exe /SILENT /DIR=…`)

### Phase 4 — BYOI fallback
- [ ] `import --installer <path>`: run a user-supplied installer in the prefix

### Phase 5 — CLI, TUI, docs, ADR
- [ ] `steam-mac gog login` (browser + code), `add` resolves GOG products by name
- [ ] status/doctor show the store
- [ ] ADR + docs

### Phase 6 — Verification
- [ ] `pnpm check`
- [ ] Live test with the user's GOG account (login + one game)

## Out of scope (first pass)

- Patches/xdelta updates, DLC selection, redistributable dependencies, cloud saves.
