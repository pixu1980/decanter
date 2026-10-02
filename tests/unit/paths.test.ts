import assert from "node:assert/strict";
import { test } from "node:test";

import { envPrefix, isSlug, slugify } from "../../src/core/paths.ts";

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
