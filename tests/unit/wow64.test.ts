import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { CliError } from "../../src/core/log.ts";
import type { WineRuntime } from "../../src/core/wine.ts";
import {
  applyWow64Fix,
  installRosettaWow64Fix,
  rosettaWow64Fix,
  usesNewWow64,
  type Wow64Fix,
} from "../../src/core/wow64.ts";
import { withTempHome } from "./_helpers.ts";

const PATCHED = new TextEncoder().encode("patched-wow64cpu-bytes");

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decanter-wow64-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeRuntime(distDir: string, overrides: Partial<WineRuntime> = {}): WineRuntime {
  return {
    name: "wine-devel",
    label: "Wine devel 11.18",
    app: "",
    distDir,
    distExe: "",
    distServer: "",
    preloader: null,
    cask: "",
    version: "11.18",
    ...overrides,
  };
}

async function writeFileIn(path: string, content: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

/** A prefix whose system32 already holds Wine's own wow64cpu.dll. */
async function makePrefix(dir: string): Promise<string> {
  const prefix = join(dir, "prefix");
  await writeFileIn(join(prefix, "drive_c", "windows", "system32", "wow64cpu.dll"), "original");
  return prefix;
}

function fetchOnce(bytes: Uint8Array): { fetchImpl: typeof fetch; calls: () => number } {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

test("the prebuilt fix is pinned for a known version only", () => {
  assert.equal(rosettaWow64Fix("11.18")?.sha256.length, 64);
  assert.equal(rosettaWow64Fix("11.17"), undefined);
});

test("only the Gcenx runtimes use Wine's new WoW64", () => {
  assert.equal(usesNewWow64(fakeRuntime("")), true);
  assert.equal(usesNewWow64(fakeRuntime("", { name: "wine-staging" })), true);
  assert.equal(usesNewWow64(fakeRuntime("", { name: "gptk" })), false);
  assert.equal(usesNewWow64(fakeRuntime("", { name: "gptk-apple" })), false);
});

test("installRosettaWow64Fix skips Intel Macs and GPTK", async () => {
  await withTempHome(async () => {
    await withTempDir(async (dir) => {
      const prefix = await makePrefix(dir);
      assert.equal(
        await installRosettaWow64Fix(fakeRuntime(join(dir, "wine")), prefix, { arch: "x64" }),
        false,
      );
      assert.equal(
        await installRosettaWow64Fix(fakeRuntime(join(dir, "wine"), { name: "gptk" }), prefix),
        false,
      );
    });
  });
});

test("installRosettaWow64Fix warns instead of failing on an unpinned version", async () => {
  await withTempHome(async () => {
    await withTempDir(async (dir) => {
      const prefix = await makePrefix(dir);
      const runtime = fakeRuntime(join(dir, "wine"), { version: "11.16" });
      assert.equal(await installRosettaWow64Fix(runtime, prefix), false);
    });
  });
});

test("applyWow64Fix installs the verified DLL into the runtime and the prefix", async () => {
  await withTempHome(async () => {
    await withTempDir(async (dir) => {
      const runtimeDir = join(dir, "wine");
      const runtimeDll = join(runtimeDir, "lib", "wine", "x86_64-windows", "wow64cpu.dll");
      await writeFileIn(runtimeDll, "original");
      const prefix = await makePrefix(dir);
      const prefixDll = join(prefix, "drive_c", "windows", "system32", "wow64cpu.dll");

      const sha256 = createHash("sha256").update(PATCHED).digest("hex");
      const fix: Wow64Fix = { url: "https://example.invalid/wow64cpu.dll", sha256 };
      const { fetchImpl, calls } = fetchOnce(PATCHED);

      const installed = await applyWow64Fix(fix, fakeRuntime(runtimeDir), prefix, { fetchImpl });
      assert.equal(installed, true);
      assert.deepEqual(new Uint8Array(await readFile(runtimeDll)), PATCHED);
      assert.deepEqual(new Uint8Array(await readFile(prefixDll)), PATCHED);
      assert.equal(await readFile(`${runtimeDll}.orig`, "utf8"), "original");
      assert.equal(await readFile(`${prefixDll}.orig`, "utf8"), "original");

      // The cached DLL is reused, so a second setup does not download again.
      await applyWow64Fix(fix, fakeRuntime(runtimeDir), prefix, { fetchImpl });
      assert.equal(calls(), 1);
    });
  });
});

test("applyWow64Fix rejects a DLL whose checksum does not match", async () => {
  await withTempHome(async () => {
    await withTempDir(async (dir) => {
      const runtimeDir = join(dir, "wine");
      await writeFileIn(
        join(runtimeDir, "lib", "wine", "x86_64-windows", "wow64cpu.dll"),
        "original",
      );
      const prefix = await makePrefix(dir);
      const fix: Wow64Fix = { url: "https://example.invalid/wow64cpu.dll", sha256: "0".repeat(64) };
      const { fetchImpl } = fetchOnce(PATCHED);

      await assert.rejects(
        () => applyWow64Fix(fix, fakeRuntime(runtimeDir), prefix, { fetchImpl }),
        CliError,
      );
    });
  });
});
