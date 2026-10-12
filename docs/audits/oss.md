# oss audit

- **Role**: oss v1
- **Date**: 2026-10-12

Evidence only: the commands this run executed with their measured values, the files it read,
the sources it consulted. No opinions - those belong in the review.

## Evidence

| What was measured | How | Result |
| ----------------- | --- | ------ |
| Repository root files | `git ls-files` | LICENSE, README.md, package.json, tsconfig.json, .npmrc, .gitignore, pnpm-lock.yaml, pnpm-workspace.yaml, bin, docs, src, tests |
| Governance and community files | filesystem check for CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GOVERNANCE, CHANGELOG, AUTHORS, MAINTAINERS, .mailmap, .editorconfig, .gitattributes, FUNDING.yml, CODEOWNERS | every one MISSING |
| `.github` tree | `ls -R .github` | `NO .github` |
| CI workflows | `git ls-files '.github/**'` | empty |
| License text | `head -3 LICENSE` | `MIT License` / `Copyright (c) 2026 Emiliano "pixu1980" Pisu` |
| Copyright credit placement | `grep -rniI 'ignacio\|martin vazquez' --exclude-dir=.git .` | README.md `## Inspirations`; no source file, config or LICENSE mentions the name |
| GitHub repository metadata | `GET https://api.github.com/repos/pixu1980/decanter` | `private: false`, `visibility: public`, `license.spdx_id: MIT`, `default_branch: main`, `created_at: 2026-10-12T10:25:19Z`, `has_issues: true`, `has_pull_requests: true`, `has_discussions: false`, `topics: []`, `open_issues: 0`, `web_commit_signoff_required: false` |
| Commit author | `git log --format='%an <%ae>' -1` | `Emiliano Pisu <pisuemiliano.1980@gmail.com>` |
| Remote origin | `git remote get-url origin` | `git@github.com:pixu1980/decanter.git` |
| Release tags | `git tag -l` | empty (0 tags) |
| Commit count and dates | `git rev-list --count HEAD` and `git log --format='%ad' --date=short` | 24 commits; first `2026-10-03`, last `2026-10-12` |
| package.json fields | `cat package.json` | `name: decanter`, `version: 0.1.0`, `private: true`, `license: MIT`; `repository`, `homepage`, `bugs`, `engines`, `keywords` all `undefined` |
| npm name availability | `npm view decanter version license repository.url maintainers` | `version: 7.5.3`, `license: GPL-3.0-or-later`, `repository.url: git+https://github.com/SU-SWS/decanter.git`, Stanford SWS maintainers |
| Runtime dependency licenses | `require('node_modules/<pkg>/package.json').license` | @opentui/core MIT, @opentui/react MIT, react MIT |
| Dev dependency licenses | same | tsx MIT, typescript Apache-2.0 |
| Dependency pinning | `cat .npmrc` | `save-exact=true` |
| Unit test files | `ls tests/unit/*.test.ts \| wc -l` | 24 |
| Unit test result | `pnpm test` | `tests 141`, `pass 141`, `fail 0` |
| TUI test result | `pnpm check` (tail) | `tests 14`, `pass 14`, `fail 0` |
| Typecheck | `pnpm typecheck` | clean (no output) |
| Lint and format config | filesystem check for eslint and prettier configs and .editorconfig | none present |
| Git hooks path | `git config core.hooksPath` | `/Users/emilianopisu/.config/git/hooks` (author-global, outside the repository) |
| In-repo hooks | `git ls-files '.husky/**'` | empty |
| Tracked `.DS_Store` | `git ls-files \| grep -i DS_Store` | none tracked |
| Docs inventory | `find docs -name '*.md'` | adr/001-017 + ADR.md, architecture.md, managing.md, troubleshooting.md, handoff/ (2), plans/ (3) |
| Audit and review dirs | `ls -d docs/audits docs/reviews` | both missing before this run |
| ADR index provenance | `head docs/adr/ADR.md` | `generated from them by pix_tool_process_adr` |
| Local Node version | `node -v` | `v26.8.2` |
| README Node requirement | `grep -n 'Node.js' README.md` | `Node.js 26.4 or newer (the OpenTUI interface needs --experimental-ffi)` |
| TypeScript strictness | `cat tsconfig.json` | `strict: true`, `noEmit: true` |
| Source size | `find src -name '*.ts' -o -name '*.tsx' \| xargs wc -l` | 10308 lines |
| Start script | `node -e require('./package.json').scripts.start` | `node bin/decanter.mjs` (repaired this session; it previously ran `src/cli.ts tui`, an unknown command) |
| Dangling doc references | `grep -rn 'plans/epic-support\|plans/runtime-and-icons\|plans/gptk-4-overlay' src/` | 0 (repaired this session) |

| Secrets: tracked env or credential files | `git ls-files \| grep -iE '\.env\|auth\.json'` | none tracked |
| Secrets: credential files in history | `git log --all --diff-filter=A --name-only \| grep -iE 'auth\.json\|config\.json\|\.env'` | none ever added (only `tsconfig.json` matched the `config` filter) |
| Secrets: personal token location | `ls -la ~/.decanter/gog ~/.decanter/epic` and `~/.decanter/config.json` | `gog/auth.json`, `epic/auth.json` and the machine settings live outside the repository, under the user home |
| Secrets: credentials in the source | `grep -rnE 'CLIENT_SECRET\|steamGridDbKey: \"' src/` | none after ADR 018: every credential lives in `config.json` and is written by `decanter init` |
| Secrets: the old credential literals anywhere under src | `grep -rn '9d85c43b…\|daafbccc…\|95e427…' src/` | 0 after ADR 018 |
| Secrets: wizard surfaces | `grep -rn 'CREDENTIAL_FIELDS' src/` | one field list drives `decanter init` and the TUI Setup screen (`src/core/config.ts`, `src/core/wizard.ts`) |
| Secrets: `.gitignore` guard | `grep -q '\.env' .gitignore` | before this run: no match, so a `.env` dropped in the tree would be committed |

| CI: workflow | `.github/workflows/ci.yml` | checkout, pnpm/action-setup and setup-node pinned to their v4.4.0 commits; `permissions: contents: read`; macos runner, Node 26.8.2, pnpm 12.11.2 |
| CI: first green run | `GET https://api.github.com/repos/pixu1980/decanter/actions/runs/38270808910` | `conclusion: success`; install, typecheck, unit and TUI steps all success |

| Governance: contribution path | `ls CONTRIBUTING.md` and `grep -n CONTRIBUTING README.md` | `CONTRIBUTING.md` present and linked from the README Docs section |
| Contribution path: clean-clone gate | `git clone . "$D/repo" && cd "$D/repo" && pnpm install --frozen-lockfile && pnpm test:tui` | passes (15/15); a fresh clone needs nothing else |

| Governance: security policy | `ls SECURITY.md` and `grep -n SECURITY README.md` | present and linked; contact (GitHub private advisory and an email) with a 7-day acknowledgment and a 90-day fix target |

| Governance: commit-msg hook | `ls .githooks/commit-msg` and `node --test tests/unit/commitMsg.test.ts` | hook present and executable; 3 tests pass (accepts a scoped commit, rejects a scope-less one, ignores merge and revert) |
| Governance: hook install | `node bin/install-hooks.mjs` | copies `.githooks/commit-msg` to `.git/hooks/commit-msg` mode 0755; wired to the package `prepare` script so `pnpm install` installs it |
| Governance: commit check in CI | `.github/workflows/ci.yml` job `commits` | validates `origin/<base>..HEAD` subjects on pull_request; logic simulated locally over 20 subjects (0 rejected) and a scope-less control (rejected) |

| Release: changelog generator | `node --test tests/unit/changelog.test.ts` | 4 tests pass; the renderer groups feat, fix, perf, refactor, revert and docs and drops chore, ci, build, test and style |
| Release: changelog file | `node bin/changelog.mjs --write` | writes CHANGELOG.md from the git history; `pnpm changelog` prints it |
| Release: workflow | `.github/workflows/release.yml` | on a `v*` tag: builds the notes with `bin/changelog.mjs --tag` and runs `gh release create`; job permission `contents: write` |

| Release: first tag and GitHub release | `git tag -a v0.1.0` and `GET https://api.github.com/repos/pixu1980/decanter/releases` | tag `v0.1.0` pushed; the Release workflow completed `success`; the release body is 1832 bytes |

## Files read

- `LICENSE`, `package.json`, `.npmrc`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.json`
- `README.md`, `docs/architecture.md`, `docs/managing.md`, `docs/troubleshooting.md`
- `docs/adr/ADR.md` and the numbered ADRs, `docs/adr/017-epic.md`
- `docs/plans/execution-plan.md`, `docs/plans/gog-implementation.md`, `docs/plans/gog-support.md`
- `src/cli.ts`, `src/core/args.ts`, `src/core/config.ts`, `src/core/paths.ts`, `src/core/stores.ts`, `src/core/wow64.ts`, `src/core/steamcmd.ts`
- `src/tui/components/HelpOverlay/_HelpOverlay.tsx`, `src/tui/App/_App.tsx`

## Web sources consulted

- OpenSSF Scorecard check documentation - <https://raw.githubusercontent.com/ossf/scorecard/main/docs/checks.md> (checks cited: License, Maintained, CI-Tests, Code-Review, Security-Policy, Dependency-Update-Tool, Token-Permissions, SAST, SBOM, Signed-Releases, Packaging, Pinned-Dependencies, Branch-Protection, Vulnerabilities, CII-Best-Practices)
- GitHub Docs - About community profiles for public repositories - <https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories>
- GitHub REST API - <https://api.github.com/repos/pixu1980/decanter>
- npm registry - <https://www.npmjs.com/package/decanter>
