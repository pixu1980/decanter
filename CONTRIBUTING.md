# Contributing

`decanter` wraps Windows-only PC games into native macOS `.app` bundles, with a
CLI and an OpenTUI interface. Contributions of every size are welcome: a bug
report, a store fix, a documentation typo.

## Before you start

- Apple Silicon Mac, macOS 14 (Sonoma) or newer.
- Node.js 26.4 or newer.
- [pnpm](https://pnpm.io) and [Homebrew](https://brew.sh) installed.
- A game you own on the store you test against is useful, but most changes do
  not need one.

## Set up

```sh
git clone git@github.com:pixu1980/decanter.git
cd decanter
pnpm install
pnpm start      # opens the interface from the checkout
```

The engine keeps every game and every credential under `~/.decanter`, so a
checkout never writes into the repository. On a machine with no credentials the
first run opens the setup wizard, or run `decanter init` from the CLI.

## Run the checks

```sh
pnpm typecheck   # tsc --noEmit
pnpm test        # unit and integration tests
pnpm test:tui    # OpenTUI render tests
pnpm check       # all of the above
```

`pnpm check` is what CI runs on every pull request and every push to `main`
(`.github/workflows/ci.yml`). A pull request is not ready until it is green.

## Commits

Every commit is an **atomic** Conventional Commit with a **mandatory scope**:

```
<type>(<scope>): <imperative subject>
```

`feat(cli): add the first-run wizard`, `fix(bundle): sanitize the app name`,
`docs(readme): document the stores`. A bare `fix: ...` is rejected: the scope
names the module, package or area the change touches, reusing an existing name
(`cli`, `config`, `tui`, `catalog`, `bundle`, `oss`, `adr`).

| Type | Use when |
|---|---|
| `feat` | New user-visible behavior |
| `fix` | Bug fix |
| `refactor` | Internal change with no behavior change |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `test` | Tests only |
| `chore` | Maintenance, tooling, dependencies |
| `ci` | CI pipeline changes |
| `style` | Formatting, no logic change |

Keep the subject imperative and at most 72 characters, with no trailing period.
Add a body only when the reason is not obvious from the subject. One logical
change per commit: split unrelated edits before committing.

Branch names use the same vocabulary, `feat/`, `fix/`, `docs/` or `chore/`
followed by a short kebab-case description, for example `feat/store-picker`.

## Pull requests

1. Branch from `main`.
2. Keep the branch focused on one feature or fix.
3. Run `pnpm check` before you open the pull request.
4. Make the title a Conventional Commit with a scope, like the commits.
5. Say in the description what changed, why, and how you verified it.
6. CI must be green and a maintainer must approve before the merge.

Small, reviewable pull requests merge faster than large ones.

## Decisions and docs

A structural decision, such as a new dependency, a boundary, a store or a config
shape, earns an ADR in `docs/adr/`. The index `docs/adr/ADR.md` is generated
from the numbered files, so add the file and let the index be rebuilt.

Describe user-facing behavior in `docs/managing.md` (day to day),
`docs/architecture.md` (how it is put together) and `docs/troubleshooting.md`
(when it breaks). The README lists the commands and the stores.

## Credentials

Never commit a credential. API keys, OAuth client ids and secrets, and session
tokens live in `~/.decanter/config.json` or the per-store token files, and
`.gitignore` blocks `.env`, `auth.json` and `config.json`. `decanter init`
collects the credentials a contributor needs.

## License

By contributing you agree that your work is released under the [MIT license](LICENSE).
