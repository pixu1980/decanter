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

- [ ] **Step 5 - OSS-005 (medium)**: The conventional-commit rule is enforced only by the author's global git hook, not by the repository, so a contributor's commit can break changelog generation.
  - [ ] **5.1**: Ship a commit-msg hook in the repository and point `core.hooksPath` at it from a `prepare` script.
  - [ ] **5.2**: Document the hook in CONTRIBUTING.md.
  - [ ] **5.3**: Add a CI step that validates a pull request's commit messages against `type(scope): subject`.
- [ ] **Step 6 - OSS-006 (medium)**: No release process: 0 tags, no CHANGELOG, no release workflow, so users cannot pin or track a version.
  - [x] **6.1**: Confirm the first version and the release cadence with the maintainer. Confirmed: `v0.1.0` now, then on demand; semantic versioning derived from Conventional Commits.
  - [ ] **6.2**: Generate CHANGELOG.md from Conventional Commits at tag time (pix-process-changelog).
  - [ ] **6.3**: Tag the first release (for example `v0.1.0`).
  - [ ] **6.4**: Add a release workflow that builds the changelog and creates the GitHub release.
- [ ] **Step 7 - OSS-007 (medium)**: No distribution path: the npm name `decanter` is taken, the package is private and has no repository field, so the only install is a clone.
  - [x] **7.1**: Decide with the maintainer: publish to npm under a scope (`@pixu1980/decanter`) or stay source-only. Confirmed: publish as `@pixu1980/decanter`.
  - [ ] **7.2**: Source-only: say so in the README and keep `private: true`.
  - [ ] **7.3**: Publishing: follow pix-process-npm-release (Trusted Publishing, provenance, staged publish), set `name`, drop `private`, add `repository`/`homepage`/`bugs`/`keywords`.
  - [ ] **7.4**: Either way, add the `repository` field so tools can link the source.
- [ ] **Step 8 - OSS-008 (medium)**: README requires Node 26.4+ but package.json declares no `engines`, so the requirement is unenforced.
  - [ ] **8.1**: Add `engines.node` (`>=26.4`) to package.json.
  - [ ] **8.2**: Use that field to pick the Node version in CI.
- [ ] **Step 9 - OSS-009 (medium)**: No CODE_OF_CONDUCT.md, so expected community behavior and how it is enforced are undefined.
  - [ ] **9.1**: Adopt Contributor Covenant 2.1 as CODE_OF_CONDUCT.md.
  - [ ] **9.2**: Set the enforcement contact and link the file from the README and CONTRIBUTING.md.
- [ ] **Step 10 - OSS-010 (low)**: No issue or pull request templates and no repository topics, so reports and PRs arrive unstructured.
  - [ ] **10.1**: Add .github/ISSUE_TEMPLATE/bug.yml and feature.yml.
  - [ ] **10.2**: Add .github/pull_request_template.md with a `pnpm check` checkbox.
  - [ ] **10.3**: Set repository topics (wine, macos, steam, gog, epic, opentui).
- [ ] **Step 11 - OSS-011 (low)**: No GOVERNANCE.md: decision rights and the maintainer/donor boundary are undocumented.
  - [ ] **11.1**: Write GOVERNANCE.md: single maintainer, how an ADR is proposed and accepted, who merges.
  - [ ] **11.2**: State the maintainer/donor boundary explicitly.
  - [ ] **11.3**: Link GOVERNANCE.md from the README.
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