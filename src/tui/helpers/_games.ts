// Game list loading plus the per-game state shown in the interface.
//
// docs: docs/architecture.md

import { gameInstalled, updateStatus, type UpdateState } from "../../core/depot.ts";
import { exists } from "../../core/fsx.ts";
import { loadContext } from "../../core/lifecycle.ts";
import type { GameProfile } from "../../core/profile.ts";
import { listGames } from "../../core/registry.ts";

/** A game plus the state the list shows. */
export interface GameRow {
  profile: GameProfile;
  imported: boolean;
  update: UpdateState;
  hasApp: boolean;
}

/** Load every registered game with its current state. */
export async function refreshGames(): Promise<GameRow[]> {
  const games = await listGames();
  return Promise.all(
    games.map(async (profile) => {
      try {
        const { paths } = await loadContext(profile.slug);
        return {
          profile,
          imported: await gameInstalled(profile, paths),
          update: (await updateStatus(profile, paths)).state,
          hasApp: exists(paths.app),
        };
      } catch {
        return { profile, imported: false, update: "unknown" as UpdateState, hasApp: false };
      }
    }),
  );
}
