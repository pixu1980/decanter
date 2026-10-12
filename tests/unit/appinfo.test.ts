import assert from "node:assert/strict";
import { test } from "node:test";

import { appInfoWindowsDepot, parseAppInfo, parseAppInfoEntries } from "../../src/core/appinfo.ts";

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function i32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value);
  return buf;
}

function u64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

/** A minimal v41 AppInfo file with one app whose `appinfo.name` is set. */
function buildAppInfo(): Buffer {
  const pool = ["root", "appid", "appinfo", "name"];
  const kv = Buffer.concat([
    Buffer.from([0x00]),
    u32(0), // container key
    Buffer.from([0x02]),
    u32(1), // "appid"
    i32(42),
    Buffer.from([0x00]),
    u32(2), // "appinfo"
    Buffer.from([0x01]),
    u32(3), // "name"
    Buffer.from("Test Game\u0000", "utf8"), // inline null-terminated value
    Buffer.from([0x08]),
    Buffer.from([0x08]),
    Buffer.from([0x08]),
  ]);
  const meta = Buffer.concat([u32(1), u32(0), u64(0n), Buffer.alloc(20), u32(0), Buffer.alloc(20)]);
  const entry = Buffer.concat([u32(42), u32(meta.length + kv.length), meta, kv]);
  const table = Buffer.concat([
    u32(pool.length),
    ...pool.map((value) => Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])])),
  ]);
  const header = Buffer.concat([u32(0x07564429), u32(1), u64(BigInt(16 + entry.length))]);
  return Buffer.concat([header, entry, table]);
}

test("parseAppInfo reads the app names from the binary cache", () => {
  const names = parseAppInfo(buildAppInfo());
  assert.equal(names.get(42), "Test Game");
});

test("parseAppInfo ignores a foreign buffer", () => {
  assert.equal(parseAppInfo(Buffer.from("definitely not appinfo")).size, 0);
});

/** A minimal v41 AppInfo file whose app declares one Windows depot. */
function buildAppInfoWithDepot(): Buffer {
  const pool = ["root", "appid", "depots", "1340481", "config", "oslist"];
  const kv = Buffer.concat([
    Buffer.from([0x00]),
    u32(0), // root container
    Buffer.from([0x02]),
    u32(1), // "appid"
    i32(1340480),
    Buffer.from([0x00]),
    u32(2), // "depots" container
    Buffer.from([0x00]),
    u32(3), // "1340481" container
    Buffer.from([0x00]),
    u32(4), // "config" container
    Buffer.from([0x01]),
    u32(5), // "oslist"
    Buffer.from("windows\u0000", "utf8"),
    Buffer.from([0x08]),
    Buffer.from([0x08]),
    Buffer.from([0x08]),
    Buffer.from([0x08]),
    Buffer.from([0x08]),
  ]);
  const meta = Buffer.concat([u32(1), u32(0), u64(0n), Buffer.alloc(20), u32(0), Buffer.alloc(20)]);
  const entry = Buffer.concat([u32(1340480), u32(meta.length + kv.length), meta, kv]);
  const table = Buffer.concat([
    u32(pool.length),
    ...pool.map((value) => Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])])),
  ]);
  const header = Buffer.concat([u32(0x07564429), u32(1), u64(BigInt(16 + entry.length))]);
  return Buffer.concat([header, entry, table]);
}

test("parseAppInfoEntries reads the depots and appInfoWindowsDepot picks the Windows one", () => {
  const entry = parseAppInfoEntries(buildAppInfoWithDepot()).get(1340480);
  assert.deepEqual(entry?.depots, [{ id: 1340481, os: ["windows"] }]);
  assert.equal(appInfoWindowsDepot(entry), 1340481);
  assert.equal(appInfoWindowsDepot(undefined), null);
});

/** A minimal v41 AppInfo file whose `common` carries a name and a type. */
function buildAppInfoWithCommon(): Buffer {
  const pool = ["root", "appid", "common", "name", "type"];
  const kv = Buffer.concat([
    Buffer.from([0x00]),
    u32(0),
    Buffer.from([0x02]),
    u32(1), // "appid"
    i32(7),
    Buffer.from([0x00]),
    u32(2), // "common"
    Buffer.from([0x01]),
    u32(3), // "name"
    Buffer.from("Steam Linux Runtime 3.0\u0000", "utf8"),
    Buffer.from([0x01]),
    u32(4), // "type"
    Buffer.from("Tool\u0000", "utf8"),
    Buffer.from([0x08]),
    Buffer.from([0x08]),
    Buffer.from([0x08]),
  ]);
  const meta = Buffer.concat([u32(1), u32(0), u64(0n), Buffer.alloc(20), u32(0), Buffer.alloc(20)]);
  const entry = Buffer.concat([u32(7), u32(meta.length + kv.length), meta, kv]);
  const table = Buffer.concat([
    u32(pool.length),
    ...pool.map((value) => Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])])),
  ]);
  const header = Buffer.concat([u32(0x07564429), u32(1), u64(BigInt(16 + entry.length))]);
  return Buffer.concat([header, entry, table]);
}

test("parseAppInfoEntries reads the name and type from common", () => {
  const entries = parseAppInfoEntries(buildAppInfoWithCommon());
  assert.deepEqual(entries.get(7), { name: "Steam Linux Runtime 3.0", type: "Tool" });
});
