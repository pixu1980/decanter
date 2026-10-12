# Security policy

## Supported versions

`decanter` is pre-1.0. Only the latest `main` is supported: a fix lands there and
is tagged in the next release.

## Reporting a vulnerability

Report privately, never in a public issue:

- Open a [private security advisory](https://github.com/pixu1980/decanter/security/advisories/new)
  on this repository, or
- email `pisuemiliano.1980@gmail.com`.

Include what you did, what happened, the affected version or commit, and a proof
of concept if you have one. A clear report is worth more than a complete one.

## What we will do

- Acknowledge the report within 7 days.
- Confirm the impact and the affected versions, and keep you updated while a fix
  is prepared.
- Aim to ship a fix or a mitigation within 90 days, and agree the disclosure date
  with you. We credit you in the advisory unless you prefer otherwise.

## What counts as a vulnerability

`decanter` runs Wine, downloads third-party builds and writes to the user's
machine, so these are in scope:

- a command that runs attacker-controlled code, or escapes the game's prefix;
- a credential leak: reading, logging or transmitting a value from
  `~/.decanter/config.json` or the per-store token files;
- a path traversal in the depot, GOG or Epic import that writes outside the game
  directory;
- an artifact accepted without its checksum (the SteamCMD install, the Gcenx
  Wine build, the pinned `wow64cpu.dll`).

Out of scope: a vulnerability in Wine, Game Porting Toolkit, SteamCMD or a game
itself, and anything that needs the attacker to already control the user's
account. Report those upstream.

## Our own practices

- No credential is stored in the repository or in its history. They live in
  `~/.decanter` and `decanter init` collects them.
- Every dependency is pinned to an exact version, and the checks run from a
  GitHub Actions workflow whose actions are pinned to a commit.
