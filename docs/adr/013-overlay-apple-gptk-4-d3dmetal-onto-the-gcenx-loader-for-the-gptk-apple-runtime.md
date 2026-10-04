# 013: Overlay Apple GPTK 4 D3DMetal onto the Gcenx loader for the gptk-apple runtime

- **Date**: 2026-10-03
- **Status**: accepted
- **Tags**: wine, runtime, macos, gptk
- **Author**: Emiliano Pisu <emiliano.pisu@webidoo.com>

## Context

The gptk runtime uses the Gcenx game-porting-toolkit cask, stuck at D3DMetal 3.0 because Gcenx has no 4.0 package. Apple ships Game Porting Toolkit 4.0 only from its developer downloads site behind an Apple ID, paired with macOS 27. The DMG redist directory is a subset overlay: the D3DMetal framework, the shared Direct3D library, six Unix bridge symlinks and six Windows bridge DLLs. It carries no macOS Wine loader and no full Wine tree. GPTK Wine also prints a stale wine-7.7 (Game Porting Toolkit 1.1) string that reads like the GPTK version.

## Decision

Add an opt-in gptk-apple runtime. resolveWine points it at the gptk-apple overlay app under the wine directory of the steam-mac home, and reads the mounted DMG directory from the appleGptkSource config field. ensureWine clones the Gcenx loader with an APFS copy-on-write clone and merges the DMG redist subset over its lib directory, rather than replacing the external and wine directories as Apple Read Me suggests, because that would delete the hundreds of Wine builtins the loader carries. status and doctor report the D3DMetal framework version instead of the misleading Wine string, so the runtime is verified rather than assumed. The default gptk path and the shared cask are left untouched.

## Consequences

The overlay builds and reports D3DMetal 4.0b2 while the default stays on 3.0, and it costs only the new D3DMetal because the loader is cloned copy-on-write. **But it does not boot games:** verified on 2026-10-03, D3DMetal 4.0's d3d11.dll fails to initialise against the Gcenx Wine 7.7 loader (err LdrInitializeThunk, status c0000142) and the game aborts; the same game boots under the default gptk. Overlaying onto a Gcenx wine-devel 11.18 build falls back to wined3d and MoltenVK instead of D3DMetal. Downside: the DMG download is manual with an Apple ID, the source path is machine-wide, and the feature tracks a beta D3DMetal.

## What would end this

This decision rests on the assumption that a Gcenx loader can host Apple's newer D3DMetal redist. That assumption is wrong today: D3DMetal 4.0 needs the matching Apple Wine build, which Gcenx has not shipped. The decision should be revisited, and gptk-apple re-evaluated, when Gcenx publishes a cask whose bundled Wine matches D3DMetal 4.0; until then games stay on gptk (D3DMetal 3.0).

## Alternatives Considered

1. Bump the Gcenx cask version: impossible, Gcenx has not packaged GPTK 4.0 (latest is 3.0-3).
1. Follow Apple Read Me and replace the external and wine directories wholesale: destroys the full Wine builtin tree carried by the Gcenx loader.
1. Mutate the installed Gcenx cask in place: no coexistence with D3DMetal 3.0 and it breaks the Homebrew receipt.
1. Build Apple Wine from source via the apple homebrew tap: correct but hours of compilation and no per-game opt-in.
