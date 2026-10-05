# 016: Rename the project to Decanter and keep all data under one home

- **Date**: 2026-10-05
- **Status**: accepted
- **Tags**: naming, paths, layout
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The tool started as a Steam-only wrapper, so its name and its home directory both said steam. It now downloads from Steam, GOG and soon Epic, and the old layout scattered a game across three places: the profile under the home, the Wine prefix under a Games folder, and the saves under the user Documents folder (through the prefix Documents symlink). The name hid what the tool does and the split layout made backups, uninstalls and a future Epic integration harder to reason about.

## Decision

The project is Decanter, the command is decanter and every machine path is rooted at the decanter home, which the DECANTER_HOME variable can override. The repo moves to Projects slash decanter slash decanter. Under the home, each game owns one folder with its profile, manifest, assets, prefix and saves, so a game is always games slash slug slash. Scratch space is temp, save backups are backups, and the runtime, steamcmd, gog, logs and bin folders stay at the root. A fresh prefix has its Windows Documents folder pointed at the game saves folder instead of the user Documents folder, so new games never write outside the home. A profile that sets dataSubdir keeps saving inside its prefix and the canonical saves folder is a symlink to it, so the saves and backup commands keep one path.

## Consequences

One name, one command and one root make the multi-store goal explicit and make a game self-contained, so uninstall, backup and migration touch a single folder. The rename rewrites the command, the package name, the environment variable and the on-disk markers, and it required a one-time migration of the home directory and the existing prefixes. Old accepted records keep the old name on purpose, as history. The Documents remapping only runs for a prefix created after the rename, because rewriting an existing prefix would hide saves that still live in the user Documents folder.

## What would end this

The assumption this leans on, and the observation that would make it wrong.

## Alternatives Considered

1. Keep the name and only change the home directory, which leaves the Steam-only name in the command and the docs.
1. Keep prefixes outside the home under a shared Games folder, which keeps one game spread across two roots.
1. Only rename the command and leave the on-disk markers, which would need a compatibility shim for every marker.
