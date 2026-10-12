import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  appBundleOpen,
  appLaunchPattern,
  isExeProcessName,
  isWineProcessName,
} from "../../src/core/lifecycle.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decanter-launch-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function waitFor(check: () => Promise<boolean>, want: boolean): Promise<boolean> {
  for (let i = 0; i < 30; i += 1) {
    if ((await check()) === want) {
      return true;
    }
    await sleep(100);
  }
  return (await check()) === want;
}

test("appLaunchPattern escapes regex metacharacters", () => {
  assert.equal(
    appLaunchPattern("/Applications/The Settlers 2 - 10th Anniversary.app"),
    "/Applications/The Settlers 2 - 10th Anniversary\\.app",
  );
  assert.equal(appLaunchPattern("a+b(c)[d]"), "a\\+b\\(c\\)\\[d\\]");
});

test("isWineProcessName accepts the loader and Windows executables", () => {
  assert.equal(isWineProcessName("wine"), true);
  assert.equal(isWineProcessName("wine64-preloader"), true);
  assert.equal(isWineProcessName("bin/S2DNG.exe"), true);
  assert.equal(isWineProcessName("C:\\windows\\system32\\explorer.exe"), true);
  assert.equal(isWineProcessName("node"), false);
  assert.equal(isWineProcessName("/bin/zsh"), false);
});

test("isExeProcessName matches the game, not the virtual-desktop explorer", () => {
  assert.equal(isExeProcessName("bin/S2DNG.exe", "bin/S2DNG.exe"), true);
  assert.equal(
    isExeProcessName("C:\\the-settlers-2-10th-anniversary\\bin\\S2DNG.exe", "bin/S2DNG.exe"),
    true,
  );
  assert.equal(isExeProcessName("C:\\windows\\system32\\explorer.exe", "bin/S2DNG.exe"), false);
  assert.equal(isExeProcessName("wine", "bin/S2DNG.exe"), false);
});

test("appBundleOpen is false for a missing bundle", async () => {
  await withTempDir(async (dir) => {
    assert.equal(await appBundleOpen(join(dir, "Missing.app")), false);
  });
});

test("appBundleOpen follows the bundle's launch script", async () => {
  await withTempDir(async (dir) => {
    const app = join(dir, "Test.app");
    const launch = join(app, "Contents", "MacOS", "launch");
    await mkdir(dirname(launch), { recursive: true });
    await writeFile(launch, "#!/bin/sh\nsleep 30\n");
    await chmod(launch, 0o755);

    const child = spawn(launch, [], { stdio: "ignore" });
    try {
      assert.equal(await waitFor(() => appBundleOpen(app), true), true);
    } finally {
      child.kill("SIGKILL");
    }
    assert.equal(await waitFor(() => appBundleOpen(app), false), true);
  });
});
