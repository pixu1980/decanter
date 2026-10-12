import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeProfile } from "../../src/core/profile.ts";
import { providerFor } from "../../src/core/stores.ts";

test("providerFor exposes one provider per store", () => {
  for (const store of ["steam", "gog", "epic"] as const) {
    assert.equal(providerFor(store).id, store);
  }
});

test("providers report their configured id and label", () => {
  assert.equal(providerFor("steam").idLabel, "depot id");
  assert.equal(providerFor("steam").configured(normalizeProfile({ name: "T", depot: 1 })), true);
  assert.equal(providerFor("steam").configured(normalizeProfile({ name: "T" })), false);

  assert.equal(providerFor("gog").idLabel, "GOG product id");
  assert.equal(providerFor("gog").catalogId(normalizeProfile({ name: "T", gogId: 5 })), 5);

  assert.equal(providerFor("epic").idLabel, "Epic app name");
  assert.equal(providerFor("epic").configured(normalizeProfile({ name: "T", epicAppName: "Anemone" })), true);
  assert.equal(providerFor("epic").catalogId(normalizeProfile({ name: "T", epicAppName: "Anemone" })), "Anemone");
});

test("each provider returns its store art file", () => {
  assert.equal(providerFor("steam").art(normalizeProfile({ name: "T", appid: 1 })).file, "key-art.jpg");
  assert.equal(providerFor("gog").art(normalizeProfile({ name: "T", gogId: 1 })).file, "gog-art.png");
  assert.equal(providerFor("epic").art(normalizeProfile({ name: "T", epicAppName: "A" })).file, "epic-art.png");
});
