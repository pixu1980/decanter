import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { downloadSteamGridArt, encodeBmp, glyphFor, initialOf } from "../../src/core/icon.ts";
import { normalizeProfile } from "../../src/core/profile.ts";

test("initialOf picks the first letter or digit", () => {
  assert.equal(initialOf("Graveyard Keeper 2"), "G");
  assert.equal(initialOf("123 Game"), "1");
  assert.equal(initialOf("!!! Unknown"), "U");
  assert.equal(initialOf("!!!"), "?");
});

test("glyphFor is case-insensitive and null for an unknown character", () => {
  const glyph = glyphFor("a");
  assert.ok(glyph);
  assert.equal(glyph.length, 5);
  assert.equal(glyph[0]!.length, 3);
  assert.equal(glyphFor("€"), null);
});

test("encodeBmp writes a 24-bit BMP with bottom-up BGR pixels", () => {
  const rgb = new Uint8Array(2 * 2 * 3);
  rgb.set([1, 2, 3], 0); // top-left pixel, RGB

  const bmp = encodeBmp(2, 2, rgb);

  assert.equal(bmp.toString("ascii", 0, 2), "BM");
  assert.equal(bmp.readUInt32LE(10), 54, "pixel data starts after the two headers");
  assert.equal(bmp.readInt32LE(18), 2, "width");
  assert.equal(bmp.readInt32LE(22), 2, "height");
  assert.equal(bmp.readUInt16LE(28), 24, "bits per pixel");
  assert.equal(bmp.length, 54 + 8 * 2, "rows are padded to a multiple of four bytes");
  assert.deepEqual([...bmp.subarray(62, 65)], [3, 2, 1], "top RGB row becomes the bottom BGR row");
});

test("downloadSteamGridArt saves the first usable image", async () => {
  const assets = mkdtempSync(join(tmpdir(), "sm-icon-"));
  const profile = normalizeProfile({ name: "Test", slug: "test", appid: 42, depot: 1, exe: "t.exe" });
  const image = new Uint8Array(2048).fill(7);
  const fakeFetch = (async (url: string) => {
    if (String(url).includes("/icons/") || String(url).includes("/grids/")) {
      const data = String(url).includes("/icons/")
        ? [
            { url: "https://cdn/icon.ico", mime: "image/vnd.microsoft.icon" },
            { url: "https://cdn/icon.png", mime: "image/png" },
          ]
        : [{ url: "https://cdn/grid.png", mime: "image/png" }];
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    }
    return new Response(image, { status: 200 });
  }) as unknown as typeof fetch;

  try {
    const saved = await downloadSteamGridArt(profile, assets, fakeFetch, "key");
    assert.equal(saved, join(assets, "grid-art.png"));
    assert.equal(existsSync(saved!), true);
  } finally {
    rmSync(assets, { recursive: true, force: true });
  }
});
