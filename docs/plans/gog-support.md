# GOG.com support — feasibility study

Research only. No code yet. The goal is to understand whether `steam-mac` can do
for GOG.com games what it already does for Steam: register a game, download the
Windows build, install it into a Wine prefix, build the `.app`, and keep the
update/save/mod lifecycle.

## How GOG differs from Steam

| | Steam | GOG |
|---|---|---|
| Launcher | Steam client / SteamCMD | GOG Galaxy (Windows-only) |
| DRM | Steam DRM on launch | **DRM-free** — no launcher needed after download |
| Download | depot + manifest (`download_depot`) | offline installer **or** Galaxy content-system build |
| Auth | SteamCMD login (account + Steam Guard) | OAuth2 (client id + secret, browser redirect) |
| macOS client | native Steam exists | **no Galaxy for macOS** → Wine, exactly like Steam |

Two ways to obtain the **Windows** build:

1. **Offline installers** (legacy, still first-class): `setup_<game>_<ver>.exe`
   plus `.bin` parts, built with Inno Setup. Downloadable from the GOG API.
2. **Galaxy content-system** (modern): per-OS builds → manifest → chunks, the
   direct equivalent of a Steam depot. This is what Heroic's `gogdl` uses.

## Existing tools (from the research)

- **gogdl** (Heroic, Python) — auth + download + install; the closest thing to
  SteamCMD. Needs Python and `requests`. `gogdl download --game <id> --platform
  windows`.
- **lgogdownloader** (C++) — offline installers *and* Galaxy builds
  (`--galaxy-install`); Linux-focused, heavy C++ deps, painful on macOS.
- **asb/gogdl** (Lua + wget), **gogg** (Go), **gogdl-cli** (Rust) — smaller
  downloaders, mostly offline installers.
- **GOG Galaxy Pipeline Builder** — official, but developer-portal only.

Local toolchain: `python3` 3.14 (Homebrew) is present, `requests` is not;
`curl`, `xar`, `tar` are available.

## macOS reality

- No native GOG Galaxy client, so GOG Windows games need Wine — which the
  project already provides.
- GOG ships macOS builds as `.pkg` (xar), extractable without running the
  installer, but that is irrelevant here: we want the **Windows** build to run
  under Wine.
- Because GOG games are DRM-free, no launcher has to run inside the prefix
  (unlike the optional Windows Steam the bundle starts today).

## Fit with the current architecture

The Steam pipeline is: `store lookup → SteamCMD download → rsync into the
prefix → .app`. Two GOG designs map onto it.

### Design A — offline installer (recommended first)

1. Auth with the GOG API and list the owned game's installers.
2. Download `setup_*.exe` + `.bin` into `~/.steam-mac/gog/<slug>/`.
3. Run the installer inside the Wine prefix:
   `wine setup.exe /SILENT /SUPPRESSMSGBOXES /DIR=C:\<installSubdir> /NOICONS`.
4. Detect the executable, build the `.app` (existing code).
5. "Update" = re-download the newest installer and re-run it.

- Pros: least code, the installer owns the layout, works for old and new games.
- Cons: needs Wine to run the installer; less control over the install dir;
  update tracking is version-string based, not manifest based.

### Design B — Galaxy content-system (parity with Steam)

1. Auth (same OAuth).
2. `GET content-system.gog.com/products/<id>/os/windows/builds?generation=2`
   → pick a build → manifest → `secure_link` per chunk → download.
3. Unpack into a folder, `rsync` into the prefix (same as `importDepot`).
4. Record the build id for update checks, mirroring the Steam manifest.

- Pros: identical model to Steam (`download` + `import`, manifest tracking).
- Cons: a real content-system client (manifests, chunk hashes, zlib), or bundle
  `gogdl` (Python + `requests`).

## Concrete API notes (verified against the docs)

- Auth: `https://auth.gog.com/auth?client_id=REDACTED&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2`
  → the user copies the `code` → `GET auth.gog.com/token` returns
  `access_token` + `refresh_token` (~1 h lifetime, refreshable).
- Owned games: `embed.gog.com/account/getFilteredProducts` (session/token).
- Product + installers: `GET api.gog.com/products/<id>?expand=downloads`
  returns `downloads.installers[].files[].downlink` (a per-file URL that
  redirects to a signed CDN link).
- Galaxy builds: `content-system.gog.com/products/<id>/os/windows/builds?generation=2`.

## What changes in the project

- `profile.ts`: add `store: "steam" | "gog"` (default `steam`) and `gogId` /
  `gogSlug`; keep `appid`/`depot` for Steam only.
- New `src/core/gog.ts` (API client: auth, product, installers/builds).
- New `src/core/gogdl.ts` or an installer step in `lifecycle.ts`.
- `add.ts`: resolve a GOG product by name (`gog.com` search) and prefill the
  profile.
- `paths.ts`: `~/.steam-mac/gog/` for tokens and downloads.
- CLI: `steam-mac gog login` (browser + code), and `download`/`import` branch on
  `store`.
- Catalog: GOG entries keyed by `gogId`.

## Effort and risk

- **Design A**: ~1–2 days. Main risk: installer silent flags vary; some games
  use non-Inno installers.
- **Design B**: ~1 week. Main risk: content-system protocol drift; chunk
  handling.
- Both: the OAuth code-copy step needs a clear UX (same as `gogdl login -c`).

## Recommendation

Implement **Design A first** (offline installers). It reuses the entire
Wine/prefix/.app pipeline, needs only a GOG API client plus an installer run,
and GOG's DRM-free nature means no launcher is required. Add Design B later if
manifest-based updates matter.

## Proposed plan (if approved)

- [ ] `docs/adr`: record the "GOG via offline installers" decision
- [ ] `src/core/gog.ts`: OAuth (login + refresh), owned games, installers
- [ ] `steam-mac gog login` and token storage under `~/.steam-mac/gog/`
- [ ] `profile.ts`: `store` + `gogId`; `add` resolves GOG products
- [ ] `cmdDownload` (GOG): fetch installer parts
- [ ] `cmdImport` (GOG): run the installer in the prefix, then detect the exe
- [ ] `update`: compare installer version
- [ ] docs + tests

## Open questions

- Does the user want a GOG account login (OAuth) or a "bring your own offline
  installer" mode (point at a downloaded `setup_*.exe`)?
- Should `update` follow Galaxy builds (Design B) or just the newest installer?
- Bundle `gogdl` (Python) or reimplement the API in TypeScript?
