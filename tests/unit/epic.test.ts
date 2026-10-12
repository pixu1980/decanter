import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { deflateSync, inflateSync } from "node:zlib";

import {
  epicCdnBases,
  epicChunkDir,
  epicChunkPath,
  epicChunkUrl,
  epicIconCandidates,
  epicLaunchParameters,
  epicLoginUrl,
  epicManifestUrl,
  epicOwnedGames,
  epicPrimaryExecutable,
  extractEpicCode,
  findOwnedGame,
  normalizeEpicName,
  parseEpicManifest,
  type EpicChunk,
} from "../../src/core/epic.ts";

// --- synthetic BuildPatch manifest writer (mirrors legendary's format) --------

function u8(value: number): Buffer {
  return Buffer.from([value]);
}

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function u64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function fstring(value: string): Buffer {
  const body = Buffer.from(value, "ascii");
  return Buffer.concat([u32(body.length + 1), body, Buffer.from([0])]);
}

function guid(parts: number[]): Buffer {
  return Buffer.concat(parts.map(u32));
}

/** Build a compressed manifest with one executable file and one chunk. */
function buildManifest(data: Buffer): Buffer {
  const fileHash = createHash("sha1").update(data).digest();

  const metaBody = Buffer.concat([
    u8(1), // data version
    u32(18), // feature level
    u8(0), // is_file_data
    u32(0), // app id
    fstring("TestApp"),
    fstring("1.0"),
    fstring("game.exe"),
    fstring(""),
    u32(0), // prereq count
    fstring(""),
    fstring(""),
    fstring(""),
    fstring("buildid"), // data version >= 1
  ]);
  const meta = Buffer.concat([u32(metaBody.length + 4), metaBody]);

  const cdlBody = Buffer.concat([
    u8(1), // cdl version
    u32(1), // count
    guid([1, 2, 3, 4]),
    u64(0x1122334455667788n),
    createHash("sha1").update(data).digest(),
    u8(5), // group
    u32(data.length), // window size
    u64(BigInt(data.length)), // file size
  ]);
  const cdl = Buffer.concat([u32(cdlBody.length + 4), cdlBody]);

  const fmlBody = Buffer.concat([
    u8(0), // fml version 0
    u32(1), // count
    fstring("game.exe"),
    fstring(""),
    fileHash,
    u8(4), // executable flag
    u32(0), // install tags
    u32(1), // chunk parts
    u32(28),
    guid([1, 2, 3, 4]),
    u32(0), // offset
    u32(data.length),
  ]);
  const fml = Buffer.concat([u32(fmlBody.length + 4), fmlBody]);

  const body = Buffer.concat([meta, cdl, fml]);
  const compressed = deflateSync(body);
  const header = Buffer.concat([
    u32(0x44bec00c),
    u32(41),
    u32(body.length),
    u32(compressed.length),
    createHash("sha1").update(body).digest(),
    u8(0x1),
    u32(18),
  ]);
  return Buffer.concat([header, compressed]);
}

test("epicLoginUrl carries the client id", () => {
  const url = epicLoginUrl({ clientId: "epic-client", clientSecret: "epic-secret" });
  assert.match(url, /www\.epicgames\.com\/id\/login\?redirectUrl=/);
  assert.match(url, /clientId%3Depic-client/);
  assert.match(url, /responseType%3Dcode/);
});

test("extractEpicCode accepts the JSON page, a URL or a raw code", () => {
  assert.equal(extractEpicCode('{"authorizationCode":"ABC123"}'), "ABC123");
  assert.equal(extractEpicCode("https://x/redirect?code=xyz&state=1"), "xyz");
  assert.equal(extractEpicCode("  RAWCODE  "), "RAWCODE");
});

test("parseEpicManifest reads the meta, chunk list and file list", () => {
  const data = Buffer.from("hello");
  const manifest = parseEpicManifest(buildManifest(data));

  assert.equal(manifest.version, 18);
  assert.equal(manifest.compressed, true);
  assert.equal(manifest.meta.appName, "TestApp");
  assert.equal(manifest.meta.buildVersion, "1.0");
  assert.equal(manifest.meta.launchExe, "game.exe");
  assert.deepEqual(manifest.chunks[0]!.guid, [1, 2, 3, 4]);
  assert.equal(manifest.chunks[0]!.hash, 0x1122334455667788n);
  assert.equal(manifest.chunks[0]!.groupNum, 5);
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0]!.filename, "game.exe");
  assert.equal(manifest.files[0]!.flags & 0x4, 0x4);
  assert.equal(manifest.files[0]!.fileSize, data.length);
  assert.equal(epicPrimaryExecutable(manifest), "game.exe");
});

test("parseEpicManifest rejects a foreign buffer", () => {
  assert.throws(() => parseEpicManifest(Buffer.from("not a manifest")), /bad magic/);
});

test("epicLaunchParameters mirrors the launcher flags", () => {
  const args = epicLaunchParameters({
    appName: "Anemone",
    namespace: "ns",
    accountId: "acc",
    displayName: "Player",
    exchangeCode: "CODE",
  });
  assert.deepEqual(args, [
    "-AUTH_LOGIN=unused",
    "-AUTH_PASSWORD=CODE",
    "-AUTH_TYPE=exchangecode",
    "-epicapp=Anemone",
    "-epicenv=Prod",
    "-EpicPortal",
    "-epicusername=Player",
    "-epicuserid=acc",
    "-epiclocale=en",
    "-epicsandboxid=ns",
  ]);
});

test("epicLaunchParameters supports an offline token and a deployment id", () => {
  const args = epicLaunchParameters({
    appName: "A",
    namespace: "n",
    accountId: "x",
    displayName: "P",
    exchangeCode: "",
    deploymentId: "dep",
    language: "fr",
  });
  assert.ok(args.includes("-AUTH_PASSWORD="));
  assert.ok(args.includes("-epicdeploymentid=dep"));
  assert.ok(args.includes("-epiclocale=fr"));
});

test("normalizeEpicName ignores case and punctuation", () => {
  assert.equal(normalizeEpicName("Tales of the Neon Sea"), "talesoftheneonsea");
  assert.equal(normalizeEpicName("TalesOfTheNeonSea"), "talesoftheneonsea");
});

test("findOwnedGame matches a title against a codename app name", () => {
  const games = [
    { appName: "TalesOfTheNeonSea", namespace: "ns", catalogItemId: "cid", title: "Tales of the Neon Sea" },
    { appName: "Sugar", namespace: "ns2", catalogItemId: "cid2", title: "Some Other Game" },
  ];
  assert.equal(findOwnedGame(games, "Tales of the Neon Sea")?.appName, "TalesOfTheNeonSea");
  assert.equal(findOwnedGame(games, "talesoftheneonsea")?.appName, "TalesOfTheNeonSea");
  assert.equal(findOwnedGame(games, "neon sea")?.appName, "TalesOfTheNeonSea");
  assert.equal(findOwnedGame(games, "sugar")?.appName, "Sugar");
  assert.equal(findOwnedGame(games, "definitely not owned"), null);
});

test("epicOwnedGames drops repeated app names", async () => {
  const original = globalThis.fetch;
  const records = [
    { appName: "Anemone", namespace: "ns1", catalogItemId: "c1", sandboxName: "Epic Game" },
    { appName: "Anemone", namespace: "ns1", catalogItemId: "c1", sandboxName: "Epic Game" },
    { appName: "Buttercup", namespace: "ns2", catalogItemId: "c2", sandboxName: "Another Game" },
  ];
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ records }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  try {
    const games = await epicOwnedGames({
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 0,
      account_id: "account",
      loginTime: 0,
    });
    assert.equal(games.length, 2);
    assert.deepEqual(
      games.map((game) => game.appName).sort(),
      ["Anemone", "Buttercup"],
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("epicChunkDir maps the manifest version to a CDN folder", () => {
  assert.equal(epicChunkDir(2), "Chunks");
  assert.equal(epicChunkDir(3), "ChunksV2");
  assert.equal(epicChunkDir(6), "ChunksV3");
  assert.equal(epicChunkDir(15), "ChunksV4");
  assert.equal(epicChunkDir(22), "ChunksV5");
});

test("epicChunkPath builds the hash_guid path", () => {
  const chunk: EpicChunk = {
    guid: [1, 2, 3, 4],
    hash: 0x1122334455667788n,
    shaHash: Buffer.alloc(20),
    groupNum: 5,
    windowSize: 5,
    fileSize: 5n,
  };
  assert.equal(
    epicChunkPath(chunk, 18),
    "ChunksV4/05/1122334455667788_00000001000000020000000300000004.chunk",
  );
  const modern = epicChunkPath(chunk, 22);
  assert.match(modern, /^ChunksV5\/plain\/05\/.+\.chunk$/);
});

test("epicChunkUrl joins a base and a path", () => {
  assert.equal(epicChunkUrl("https://cdn.example/CloudDir/", "/ChunksV4/x.chunk"), "https://cdn.example/CloudDir/ChunksV4/x.chunk");
});

test("epicManifestUrl and epicCdnBases read the query parameters", () => {
  const entry = {
    uri: "Builds/Test/CloudDir/abc.manifest",
    queryParams: [
      { name: "CloudDir", value: "Builds/Test/CloudDir" },
      { name: "ExtraQueryParams", value: "https://cdn.example/x" },
    ],
  };
  assert.equal(
    epicManifestUrl(entry),
    "https://download.epicgames.com/Builds/Test/CloudDir/abc.manifest?CloudDir=Builds%2FTest%2FCloudDir&ExtraQueryParams=https%3A%2F%2Fcdn.example%2Fx",
  );
  assert.deepEqual(epicCdnBases(entry), [
    "https://download.epicgames.com/Builds/Test/CloudDir",
    "https://cdn.example/x",
  ]);
  assert.deepEqual(epicCdnBases(undefined), ["https://download.epicgames.com"]);
});

test("epicIconCandidates orders the iconic images first", () => {
  const urls = epicIconCandidates({
    keyImages: [
      { type: "Thumbnail", url: "https://x/thumb" },
      { type: "DieselGameBoxTall", url: "https://x/tall" },
      { type: "DieselGameBox", url: "https://x/box" },
    ],
  });
  assert.deepEqual(urls, ["https://x/box", "https://x/tall", "https://x/thumb"]);
  assert.deepEqual(epicIconCandidates(null), []);
});

// Keep the synthetic writer honest: the compressed payload inflates to the body
// whose SHA-1 the header carries.
test("the synthetic manifest payload is a valid zlib stream", () => {
  const manifest = buildManifest(Buffer.from("abc"));
  assert.doesNotThrow(() => inflateSync(manifest.subarray(41)));
});
