import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeProfile } from "../../src/core/profile.ts";
import { gameExists, getGame, listGames, removeGameRecord, resolveGame, saveGame } from "../../src/core/registry.ts";
import { gameProfilePath, slugify } from "../../src/core/paths.ts";
import { withTempHome } from "./_helpers.ts";

test("registry round-trips profiles", async () => {
  await withTempHome(async () => {
    assert.deepEqual(await listGames(), []);

    const profile = normalizeProfile({ name: "Graveyard Keeper 2", appid: 4358690, depot: 4358691 });
    await saveGame(profile);

    assert.equal(await gameExists("graveyard-keeper-2"), true);
    const games = await listGames();
    assert.equal(games.length, 1);
    assert.equal(games[0]?.appid, 4358690);

    const loaded = await getGame("graveyard-keeper-2");
    assert.equal(loaded.name, "Graveyard Keeper 2");
    assert.equal(loaded.depot, 4358691);

    await removeGameRecord("graveyard-keeper-2");
    assert.equal(await gameExists("graveyard-keeper-2"), false);
  });
});

test("resolveGame accepts slug, prefix and name", async () => {
  await withTempHome(async () => {
    await saveGame(normalizeProfile({ name: "The Cosmic Wheel Sisterhood" }));
    assert.equal((await resolveGame("the-cosmic-wheel-sisterhood")).slug, "the-cosmic-wheel-sisterhood");
    assert.equal((await resolveGame("the-cosmic")).slug, "the-cosmic-wheel-sisterhood");
    assert.equal((await resolveGame("The Cosmic Wheel Sisterhood")).slug, "the-cosmic-wheel-sisterhood");
  });
});

test("gameProfilePath sits inside the registry", async () => {
  await withTempHome(async () => {
    const slug = slugify("Office Management 101");
    assert.equal(slug, "office-management-101");
    assert.match(gameProfilePath(slug), /\/games\/office-management-101\/game\.json$/);
  });
});
