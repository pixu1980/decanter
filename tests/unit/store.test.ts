import assert from "node:assert/strict";
import { test } from "node:test";

import { detailsUrl, iconCandidates, searchApp, searchUrl, storeApp } from "../../src/core/store.ts";

test("searchUrl encodes the term", () => {
  assert.match(searchUrl("graveyard keeper"), /term=graveyard%20keeper/);
});

test("detailsUrl targets the app", () => {
  assert.match(detailsUrl(4358690), /appids=4358690/);
});

test("iconCandidates are ordered best first and cover both CDNs", () => {
  const candidates = iconCandidates(57640);
  assert.match(candidates[0]!, /library_600x900_2x\.jpg$/);
  assert.ok(candidates.some((url) => url.includes("shared.akamai")));
  assert.ok(candidates.some((url) => url.includes("cdn.cloudflare")));
});

test("searchApp returns the first hit", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ items: [{ id: 4358690, name: "Graveyard Keeper 2" }] }), {
      status: 200,
    })) as unknown as typeof fetch;
  const hit = await searchApp("graveyard keeper", fakeFetch);
  assert.deepEqual(hit, { appid: 4358690, name: "Graveyard Keeper 2" });
});

test("storeApp maps the app details payload", async () => {
  const payload = {
    "4358690": {
      success: true,
      data: {
        name: "Graveyard Keeper 2",
        header_image: "https://cdn/header.jpg",
        developers: ["Lazy Bear Games"],
        publishers: ["tinyBuild"],
        release_date: { date: "2026" },
      },
    },
  };
  const fakeFetch = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
  const app = await storeApp(4358690, fakeFetch);
  assert.equal(app?.name, "Graveyard Keeper 2");
  assert.deepEqual(app?.developers, ["Lazy Bear Games"]);
  assert.equal(app?.libraryImage, iconCandidates(4358690)[0]);
});

test("storeApp returns null when the store has no entry", async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
  assert.equal(await storeApp(1, fakeFetch), null);
});
