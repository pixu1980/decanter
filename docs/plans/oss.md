# oss plan

- **Role**: oss v1
- **Date**: 2026-10-12

Steps re-derived from the open findings in [the review](../reviews/oss.md) on every run, worst
first. Mark an executed step or sub-step with `[x]` - the next sync keeps the mark while its
finding stays open. This file is deleted by the run that finds nothing open.

## Decisions taken (maintainer, 2026-10-12)

- **Copyright**: the holder is `Emiliano "pixu1980" Pisu`; Ignacio Martin Vazquez is credited under an inspirations section only.
- **Distribution**: publish to npm as `@pixu1980/decanter`.
- **Release**: tag `v0.1.0` now, then on demand; versions follow Conventional Commits (semantic versioning).
- **Code of Conduct**: adopt Contributor Covenant 2.1.
- **Funding**: accepted; add `.github/FUNDING.yml`.

## Steps

- [ ] **Step 7 - OSS-007 (medium)**: No distribution path: the npm name `decanter` is taken, the package is private and has no repository field, so the only install is a clone.
  - [x] **7.1**: Decide with the maintainer: publish to npm under a scope (`@pixu1980/decanter`) or stay source-only. Confirmed: publish as `@pixu1980/decanter`.
  - [ ] **7.2**: Source-only: say so in the README and keep `private: true`.
  - [ ] **7.3**: Publishing: follow pix-process-npm-release (Trusted Publishing, provenance, staged publish), set `name`, drop `private`, add `repository`/`homepage`/`bugs`/`keywords`.
  - [ ] **7.4**: Either way, add the `repository` field so tools can link the source.
- [ ] **Step 12 - OSS-012 (low)**: No dependency-update automation; three runtime dependencies are pinned exactly and drift silently.
  - [ ] **12.1**: Add .github/dependabot.yml for npm on a weekly schedule, or a Renovate config.
  - [ ] **12.2**: Gate: Dependabot opens a PR and CI runs on it.
- [ ] **Step 13 - OSS-013 (low)**: No linter, formatter or .editorconfig, so style consistency relies on review alone.
  - [ ] **13.1**: Add .editorconfig.
  - [ ] **13.2**: Add a formatter/linter and a `lint` script included in `pnpm check`.
- [ ] **Step 14 - OSS-014 (info)**: No supply-chain artifacts beyond the license: no .gitattributes, no SBOM, no SAST, no signed releases.
  - [ ] **14.1**: Add .gitattributes (`* text=auto eol=lf`).
  - [ ] **14.2**: Decide with the maintainer whether to add CodeQL (SAST) and an SBOM in the release workflow.
- [ ] **Step 15 - OSS-015 (info)**: Funding is undefined: no FUNDING.yml and no statement, while the role expects funding to be transparent and independent of one payer.
  - [x] **15.1**: Decide with the maintainer whether the project accepts funding. Confirmed: funding accepted.
  - [ ] **15.2**: If yes, add .github/FUNDING.yml and a funding section to the README; if no, state that the project is unfunded.