# Changelog

All notable changes to this project. Generated from the commits by
`pnpm changelog`; `chore`, `ci`, `build`, `test` and `style` commits earn no
entry but stay in the git log.

## Unreleased - 2026-10-12

### Added

- **cli**: add the first-run credential wizard (`525306d`)
- **epic**: add the Epic store and a unified cross-store catalog (`818aa3b`)
- **gog**: GOG support, provider-aware icons and runtime management (`f5c94b7`)
- **catalog**: add Game Dev Studio (`8e575e8`)
- **add**: resolve the Windows depot id automatically (`c126335`)
- **tui**: document the activity panel and esc-cancel in the help (`ead032f`)
- **tui**: live activity log and esc to cancel (`453bf26`)
- **gptk-apple**: overlay only Apple's D3DMetal layer (`52beaf7`)
- **repo**: unified Steam wrapper engine, CLI and OpenTUI interface (`11734cc`)

### Changed

- **config**: move every credential into ~/.decanter and gate providers (`8f478ff`)

### Fixed

- **list**: read the cache without credentials and gate only the fetch (`0eae034`)
- **cli**: repair the start script and align the CLI help with the code (`435fbf9`)
- **icon**: write real PNGs and center-crop the source (`03a5f44`)

### Documentation

- **oss**: use the American spelling in the audit (`79b24e8`)
- **oss**: add the security policy and resolve OSS-004 (`2bbaf52`)
- **oss**: add the contribution guide and resolve OSS-003 (`88e742c`)
- **oss**: mark OSS-002 resolved and record the green CI run (`0cd7396`)
- **oss**: document the credential wizard and resolve OSS-016 (`6537099`)
- **oss**: record OSS-016 secrets hygiene (`24ead6f`)
- **oss**: resolve OSS-001 copyright holder (`518f321`)
- **oss**: audit, review and plan (`058edd0`)
- **readme**: document the missing commands, flags and config keys (`4af943b`)
- **stores**: document Steam, GOG and Epic and drop the steam-mac name (`3600c0e`)
- **adr**: record the architecture decisions and finish the plan (`f0575fd`)
