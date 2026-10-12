# 018: Keep API credentials out of the source and collect them with a first-run wizard

- **Date**: 2026-10-12
- **Status**: accepted
- **Tags**: security, config, wizard, credentials
- **Author**: Emiliano Pisu <pisuemiliano.1980@gmail.com>

## Context

The repository is public and shipped three credentials in src/: the GOG Galaxy and Epic launcher public-client ids and secrets, and a shared SteamGridDB key as the config default. A public client secret is not confidential by OAuth design, but no credential should live in a repository or its history, and a user could not tell which values were theirs.

## Decision

No credential ships in the source. config.json gains a credentials block (steam.apiKey, steam.steamId, steamGridDb, gog.clientId/clientSecret, epic.clientId/clientSecret), and loadConfig folds the pre-credentials top-level keys into it. gog.ts and epic.ts take their public-client credentials as a parameter; a provider whose credentials are missing is blocked with a pointer to the wizard. The first-run wizard is one field list driven by two surfaces: `decanter init` (CLI, hidden input for secrets) and the TUI Setup screen it opens, so they cannot drift. The catalog reads each configured store's local cache before the fetch.

## Consequences

The repository and its history are credential-free and the tool still works out of the box for a configured user. GOG and Epic cannot work until the user pastes the launcher public-client values (documented as coming from the gogdl/Heroic and legendary sources), so a fresh install shows the wizard. The three literals were purged from every blob with git filter-repo and main was force-pushed, so every SHA changed and existing clones must re-clone.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Leave the public-client credentials in the source, on the argument that they are not secret.
1. Read the credentials only from environment variables, which a desktop user cannot set.
1. Keep the credentials in a separate credentials.json rather than config.json.
