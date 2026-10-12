# Governance

How decisions are made in `decanter`, who makes them, and what funding does not
buy. It is short on purpose: one maintainer, one decision record, one gate.

## Roles

- **Maintainer**: `pixu1980` (Emiliano Pisu). The maintainer is the only person
  who merges to `main`, creates a release tag and publishes a release. This is a
  single-maintainer project today; a second maintainer would be added here and in
  the repository settings when one exists.
- **Contributor**: anyone who opens an issue or a pull request. Contributions of
  every size are welcome; the path is in [CONTRIBUTING.md](CONTRIBUTING.md).
- **User**: anyone who installs the tool. A reproducible bug report is a
  contribution.

## How work moves

1. An idea starts as an issue, using the issue forms.
2. A change lands as a branch and a pull request, titled as a Conventional
   Commit with a scope.
3. CI runs `pnpm check` (typecheck, unit and TUI tests) on every pull request and
   every push to `main`.
4. The maintainer reviews and merges when CI is green. A contributor does not
   merge their own change.
5. A release is a `v*` tag the maintainer pushes; the release workflow runs the
   checks and publishes the release.

## Decisions and the ADR log

A structural decision earns an Architecture Decision Record in `docs/adr/`: a
new dependency, a boundary between modules, a new store, a change to the config
shape, or anything a future reader would ask "why is it like this" about.

- The numbered file is the source of truth; the index `docs/adr/ADR.md` is
  generated from the files.
- An ADR is proposed in the same pull request as the change it describes, and is
  **accepted when the pull request merges**. The maintainer can mark one
  `superseded` when a later ADR replaces it.
- Ordinary changes, bug fixes and documentation do not need an ADR.

## Funding and its boundary

`decanter` accepts no funding today, and no sponsor has a say in it. If funding
is added, this section states where it goes, and these hold:

- Funding is transparent: the source and the use are named in the repository.
- Funding buys nothing in the roadmap, the priorities, the review order or the
  merge decision. Those belong to the maintainer.
- A sponsor is a user like any other; a feature request from a sponsor is an
  issue, not a commitment.
- No single payer can set the project's direction, and a funding change that
  would make one necessary is a governance change, recorded here.

## Security

Report a vulnerability privately, never in a public issue, following
[SECURITY.md](SECURITY.md). Participation is covered by
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Changing this document

This document changes the way everything else does: a pull request, a review by
the maintainer, and a merge. A change to the roles or the funding boundary is a
structural decision, so it lands with an ADR.
