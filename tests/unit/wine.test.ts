import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { defaultConfig } from "../../src/core/config.ts";
import { readText } from "../../src/core/fsx.ts";
import { normalizeProfile } from "../../src/core/profile.ts";
import {
  d3dMetalVersion,
  ensureWine,
  latestWineVersion,
  resolveWine,
  runtimeDetails,
  runtimeVersion,
  type WineRuntime,
} from "../../src/core/wine.ts";
import { withTempHome } from "./_helpers.ts";

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>4.0</string>
</dict>
</plist>
`;

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "steam-mac-wine-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeRuntime(distDir: string, distExe = ""): WineRuntime {
  return {
    name: "gptk",
    label: "Game Porting Toolkit",
    app: "",
    distDir,
    distExe,
    distServer: "",
    preloader: null,
    cask: "",
    version: "",
  };
}

async function writeD3dMetalLib(libDir: string, version: string): Promise<void> {
  const plist = join(
    libDir,
    "external",
    "D3DMetal.framework",
    "Versions",
    "Current",
    "Resources",
    "Info.plist",
  );
  await mkdir(dirname(plist), { recursive: true });
  await writeFile(plist, INFO_PLIST.replace("<string>4.0</string>", `<string>${version}</string>`));
}

async function writeD3dMetal(distDir: string, version: string): Promise<void> {
  await writeD3dMetalLib(join(distDir, "lib"), version);
}

async function writeFileIn(path: string, content: string, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  if (mode !== undefined) {
    await chmod(path, mode);
  }
}

test("d3dMetalVersion is null when the framework is absent", async () => {
  await withTempDir(async (dir) => {
    assert.equal(await d3dMetalVersion(fakeRuntime(join(dir, "wine"))), null);
  });
});

test("d3dMetalVersion reads CFBundleShortVersionString", async () => {
  await withTempDir(async (dir) => {
    const distDir = join(dir, "wine");
    await writeD3dMetal(distDir, "4.0");
    assert.equal(await d3dMetalVersion(fakeRuntime(distDir)), "4.0");
  });
});

test("runtimeVersion is null without a loader", async () => {
  await withTempDir(async (dir) => {
    assert.equal(await runtimeVersion(fakeRuntime(join(dir, "wine"))), null);
  });
});

test("runtimeDetails reports D3DMetal and the base Wine version", async () => {
  await withTempDir(async (dir) => {
    const distDir = join(dir, "wine");
    const exe = join(distDir, "bin", "wine64");
    await writeFileIn(exe, "#!/bin/sh\necho 'wine-7.7 (Game Porting Toolkit 1.1)'\n", 0o755);
    await writeD3dMetal(distDir, "4.0");

    assert.equal(await runtimeVersion(fakeRuntime(distDir, exe)), "D3DMetal 4.0 · wine-7.7");
  });
});

test("runtimeDetails summarizes a D3DMetal runtime", async () => {
  await withTempDir(async (dir) => {
    const distDir = join(dir, "wine");
    const exe = join(distDir, "bin", "wine64");
    await writeFileIn(exe, "#!/bin/sh\necho 'wine-7.7 (Game Porting Toolkit 1.1)'\n", 0o755);
    await writeD3dMetal(distDir, "4.0b2");

    const runtime: WineRuntime = {
      ...fakeRuntime(distDir, exe),
      name: "gptk-apple",
      label: "Game Porting Toolkit (Apple)",
    };
    const profile = normalizeProfile({ name: "Test", slug: "test", wineRuntime: "gptk-apple" });
    const details = await runtimeDetails(runtime, profile);

    assert.equal(details.wineVersion, "wine-7.7");
    assert.equal(details.d3dMetal, "4.0b2");
    assert.equal(details.backend, "D3DMetal 4.0b2");
    assert.equal(details.summary, "Game Porting Toolkit (Apple) · wine-7.7 · D3DMetal 4.0b2");
  });
});

test("runtimeDetails describes the native DX9 trick", async () => {
  await withTempDir(async (dir) => {
    const distDir = join(dir, "wine");
    const exe = join(distDir, "bin", "wine");
    await writeFileIn(exe, "#!/bin/sh\necho 'wine-11.18'\n", 0o755);

    const runtime: WineRuntime = { ...fakeRuntime(distDir, exe), name: "wine-devel", label: "Wine devel 11.18" };
    const profile = normalizeProfile({
      name: "Test",
      slug: "test",
      wineRuntime: "wine-devel",
      wineVersion: "11.18",
      wine: { tricks: ["d3dx9"], dllOverrides: [], args: [], virtualDesktop: "", env: {} },
    });
    const details = await runtimeDetails(runtime, profile);

    assert.equal(details.d3dMetal, null);
    assert.equal(details.backend, "DX9 (native d3dx9)");
    assert.equal(details.summary, "Wine devel 11.18 · DX9 (native d3dx9)");
  });
});

test("latestWineVersion picks the newest release that ships the flavor asset", async () => {
  const releases = [
    { tag_name: "11.18", assets: [{ name: "wine-staging-11.18-osx64.tar.xz" }] },
    { tag_name: "11.17", assets: [{ name: "wine-devel-11.17-osx64.tar.xz" }] },
  ];
  const fakeFetch = (async () => new Response(JSON.stringify(releases), { status: 200 })) as unknown as typeof fetch;

  assert.equal(await latestWineVersion("devel", fakeFetch), "11.17");
  assert.equal(await latestWineVersion("staging", fakeFetch), "11.18");
});

test("latestWineVersion returns null when the release list fails", async () => {
  const fakeFetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  assert.equal(await latestWineVersion("devel", fakeFetch), null);
});

test("normalizeProfile accepts the gptk-apple runtime", () => {
  const profile = normalizeProfile({
    name: "Test",
    slug: "test",
    wineRuntime: "gptk-apple",
  });
  assert.equal(profile.wineRuntime, "gptk-apple");
});

test("resolveWine maps gptk-apple to the overlay app and its source", async () => {
  await withTempHome(async () => {
    const home = process.env.SM_HOME!;
    const profile = normalizeProfile({ name: "Test", slug: "test", wineRuntime: "gptk-apple" });
    const config = {
      ...defaultConfig(),
      gptkApp: join(home, "base.app"),
      appleGptkSource: join(home, "dmg"),
    };
    const runtime = resolveWine(profile, config);

    assert.equal(runtime.name, "gptk-apple");
    assert.equal(runtime.app, join(home, "wine", "gptk-apple", "Game Porting Toolkit.app"));
    assert.equal(runtime.appleSource, join(home, "dmg"));
    assert.equal(runtime.baseApp, join(home, "base.app"));
    assert.equal(runtime.distExe, join(runtime.distDir, "bin", "wine64"));
  });
});

test("ensureWine swaps only the D3DMetal layer over a Gcenx loader", async () => {
  await withTempHome(async () => {
    const home = process.env.SM_HOME!;

    const wine = join(home, "base.app", "Contents", "Resources", "wine");
    await writeFileIn(join(wine, "bin", "wine64"), "#!/bin/sh\necho 'wine-7.7 (Game Porting Toolkit 1.1)'\n", 0o755);
    await writeFileIn(join(wine, "bin", "wineserver"), "#!/bin/sh\n", 0o755);
    await writeD3dMetal(join(home, "base.app", "Contents", "Resources", "wine"), "3.0");
    await writeFileIn(join(wine, "lib", "wine", "x86_64-windows", "advapi32.dll"), "base");
    await writeFileIn(join(wine, "lib", "wine", "x86_64-windows", "d3d11.dll"), "old");
    await writeFileIn(join(wine, "lib", "wine", "x86_64-unix", "ntdll.so"), "base");

    const redist = join(home, "dmg", "redist", "lib");
    await writeD3dMetalLib(redist, "4.0b2");
    await writeFileIn(join(redist, "external", "libd3dshared.dylib"), "new");
    await writeFileIn(join(redist, "wine", "x86_64-windows", "d3d11.dll"), "new");
    await writeFileIn(join(redist, "wine", "x86_64-unix", "d3d11.so"), "new");

    const profile = normalizeProfile({ name: "Test", slug: "test", wineRuntime: "gptk-apple" });
    const config = {
      ...defaultConfig(),
      gptkApp: join(home, "base.app"),
      appleGptkSource: join(home, "dmg"),
    };
    const runtime = resolveWine(profile, config);
    await ensureWine(runtime);

    assert.equal(await d3dMetalVersion(runtime), "4.0b2");
    assert.equal(await runtimeVersion(runtime), "D3DMetal 4.0b2 · wine-7.7");
    const lib = join(runtime.distDir, "lib");
    assert.equal(await readText(join(lib, "wine", "x86_64-windows", "advapi32.dll")), "base");
    // The redist's bridge DLLs are skipped: they do not initialise on Wine 7.7.
    assert.equal(await readText(join(lib, "wine", "x86_64-windows", "d3d11.dll")), "old");
    assert.equal(await readText(join(lib, "wine", "x86_64-unix", "ntdll.so")), "base");
    assert.equal(await readText(join(lib, "external", "libd3dshared.dylib")), "new");

    // Idempotent: a second run keeps the overlay.
    await ensureWine(runtime);
    assert.equal(await d3dMetalVersion(runtime), "4.0b2");
  });
});

test("ensureWine falls back to gptk when the Apple DMG is unavailable", async () => {
  await withTempHome(async () => {
    const home = process.env.SM_HOME!;
    const base = join(home, "base.app");
    const wine = join(base, "Contents", "Resources", "wine");
    await writeFileIn(join(wine, "bin", "wine64"), "#!/bin/sh\necho 'wine-7.7'\n", 0o755);
    await writeFileIn(join(wine, "bin", "wineserver"), "#!/bin/sh\n", 0o755);
    await writeD3dMetal(wine, "3.0");

    const profile = normalizeProfile({ name: "Test", slug: "test", wineRuntime: "gptk-apple" });
    const config = { ...defaultConfig(), gptkApp: base, appleGptkSource: "" };
    const runtime = resolveWine(profile, config);
    assert.equal(runtime.name, "gptk-apple");

    await ensureWine(runtime);
    assert.equal(runtime.name, "gptk", "the runtime is repointed to the stock GPTK");
    assert.equal(runtime.distExe, join(wine, "bin", "wine64"));
  });
});
