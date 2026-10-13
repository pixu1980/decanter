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