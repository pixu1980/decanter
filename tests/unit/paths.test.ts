import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { defaultConfig } from "../../src/core/config.ts";
import { resolveGamePaths } from "../../src/core/game.ts";
import {
  backupsDir,
  decanterHome,
  envPrefix,
  gameDir,
  gamePrefixDir,
  gameSavesDir,
  gogDownloadsDir,
  isSlug,
  slugify,
  tempDir,
} from "../../src/core/paths.ts";
import { normalizeProfile } from "../../src/core/profile.ts";

test("slugify produces folder-safe slugs", () => {
  assert.equal(slugify("Graveyard Keeper 2"), "graveyard-keeper-2");
  assert.equal(slugify("Broken Sword - Shadow of the Templars: The Director's Cut (2009)"), "broken-sword-shadow-of-the-templars-the-director-s-cut-2009");
  assert.equal(slugify("  Spaces  &&  Symbols  "), "spaces-symbols");
});

test("envPrefix derives the legacy environment prefix", () => {
  assert.equal(envPrefix("graveyard-keeper-2"), "GK2");
  assert.equal(envPrefix("broken-sword-directors-cut"), "BSDC");
  assert.equal(envPrefix("the-cosmic-wheel-sisterhood"), "TCWS");
});

test("isSlug accepts only canonical slugs", () => {
  assert.equal(isSlug("office-management-101"), true);
  assert.equal(isSlug("Office Management 101"), false);
  assert.equal(isSlug("-bad-"), false);
});

test("every path lives under the decanter home", () => {
  const previous = process.env.DECANTER_HOME;
  process.env.DECANTER_HOME = "/tmp/decanter-home";
  try {
    assert.equal(decanterHome(), "/tmp/decanter-home");
    assert.equal(gameDir("test"), "/tmp/decanter-home/games/test");
    assert.equal(gamePrefixDir("test"), "/tmp/decanter-home/games/test/prefix");
    assert.equal(gameSavesDir("test"), "/tmp/decanter-home/games/test/saves");
    assert.equal(tempDir(), "/tmp/decanter-home/temp");
    assert.equal(gogDownloadsDir("test"), "/tmp/decanter-home/temp/gog/test");
    assert.equal(backupsDir(), "/tmp/decanter-home/backups");
  } finally {
    if (previous === undefined) {
      delete process.env.DECANTER_HOME;
    } else {
      process.env.DECANTER_HOME = previous;
    }
  }
});

test("resolveGamePaths keeps the prefix and saves inside the game folder", () => {
  const previous = process.env.DECANTER_HOME;
  process.env.DECANTER_HOME = "/tmp/decanter-home";
  try {
    const config = defaultConfig();
    const plain = resolveGamePaths(normalizeProfile({ name: "Test", slug: "test" }), config);
    assert.equal(plain.prefix, "/tmp/decanter-home/games/test/prefix");
    assert.equal(plain.savesDir, "/tmp/decanter-home/games/test/saves");
    assert.equal(plain.dataDir, plain.savesDir, "without dataSubdir the saves folder is the data folder");

    const inPrefix = resolveGamePaths(
      normalizeProfile({ name: "In Prefix", slug: "in-prefix", dataSubdir: "users/x/Saves" }),
      config,
    );
    assert.equal(inPrefix.dataDir, join(inPrefix.prefix, "drive_c", "users/x/Saves"));
    assert.equal(inPrefix.savesDir, "/tmp/decanter-home/games/in-prefix/saves");
  } finally {
    if (previous === undefined) {
      delete process.env.DECANTER_HOME;
    } else {
      process.env.DECANTER_HOME = previous;
    }
  }
});
