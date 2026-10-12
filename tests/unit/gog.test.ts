import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";

import {
  baseDepots,
  chunkUrl,
  decodeZlib,
  extractGogCode,
  fillUrl,
  galaxyPath,
  gogLoginUrl,
  windowsInstallers,
  type GogBuildMeta,
  type GogProduct,
} from "../../src/core/gog.ts";

test("galaxyPath shards a hash", () => {
  assert.equal(galaxyPath("abcdef1234"), "ab/cd/abcdef1234");
  assert.equal(galaxyPath("ab/cd/abcdef"), "ab/cd/abcdef");
});

test("decodeZlib reads a zlib payload", () => {
  const buffer = deflateSync(Buffer.from(JSON.stringify({ hello: "world" })));
  assert.deepEqual(decodeZlib(buffer), { hello: "world" });
});

test("decodeZlib falls back to plain JSON", () => {
  assert.deepEqual(decodeZlib(Buffer.from('{"a":1}')), { a: 1 });
});

test("gogLoginUrl carries the client id", () => {
  const url = gogLoginUrl({ clientId: "gog-client", clientSecret: "gog-secret" });
  assert.match(url, /auth\.gog\.com\/auth\?/);
  assert.match(url, /client_id=gog-client/);
  assert.match(url, /response_type=code/);
});

test("gogLoginUrl honours a custom redirect", () => {
  const url = gogLoginUrl({ clientId: "gog-client", clientSecret: "gog-secret" }, "http://localhost:12345/login");
  assert.match(url, /redirect_uri=http%3A%2F%2Flocalhost%3A12345%2Flogin/);
});

test("extractGogCode accepts a redirect URL or a raw code", () => {
  assert.equal(extractGogCode("https://embed.gog.com/on_login_success?origin=client&code=ABC123"), "ABC123");
  assert.equal(extractGogCode("http://localhost:1/login?code=xyz"), "xyz");
  assert.equal(extractGogCode("  ABC123  "), "ABC123");
});

test("fillUrl replaces parameters", () => {
  assert.equal(fillUrl({ url_format: "https://cdn/{path}", parameters: { path: "/x" } }), "https://cdn//x");
});

test("chunkUrl appends the sharded md5 to the path", () => {
  const url = chunkUrl([{ url_format: "https://cdn/{path}", parameters: { path: "/content" } }], "abcdef1234");
  assert.equal(url, "https://cdn//content/ab/cd/abcdef1234");
});

test("windowsInstallers keeps only the Windows installers", () => {
  const product = {
    id: 1,
    title: "X",
    downloads: {
      installers: [
        { id: "a", os: "windows", language: "en", total_size: 1, files: [] },
        { id: "b", os: "linux", language: "en", total_size: 1, files: [] },
      ],
    },
  } as GogProduct;

  assert.deepEqual(
    windowsInstallers(product).map((installer) => installer.id),
    ["a"],
  );
});

test("baseDepots keeps the base product and matches the language", () => {
  const meta = {
    baseProductId: "1",
    installDirectory: "X",
    depots: [
      { productId: "1", languages: ["*"], manifest: "m1" },
      { productId: "1", languages: ["fr-FR"], manifest: "m2" },
      { productId: "2", languages: ["*"], manifest: "m3" },
    ],
  } as GogBuildMeta;

  assert.deepEqual(
    baseDepots(meta, "en-US").map((depot) => depot.manifest),
    ["m1"],
  );
  assert.deepEqual(
    baseDepots(meta, "fr-FR").map((depot) => depot.manifest),
    ["m1", "m2"],
  );
});
