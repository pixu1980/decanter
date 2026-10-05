// Global Cmd+Q helper for games that ship no macOS menu bar.
//
// Unity games define no Win32 menu, so Wine never builds a macOS app menu and
// Cmd+Q has nothing to trigger. This compiles a tiny Swift helper that registers
// Cmd+Q as a Carbon global hotkey while the game runs and then runs
// `wineserver -k` on its prefix. Carbon hotkeys need no Accessibility
// permission. The hotkey is global: while the game runs, Cmd+Q ends it.
// Best effort — without `swiftc` the helper is absent and `decanter quit`
// remains the fallback.
//
// docs: docs/troubleshooting.md

import { dirname, join } from "node:path";
import { exec, isDryRun, which } from "./exec.ts";
import { exists, mkdirp, writeText } from "./fsx.ts";
import { log, warn } from "./log.ts";
import { binDir } from "./paths.ts";

const SWIFT_SOURCE = String.raw`import Cocoa
import Carbon.HIToolbox

var wineserverPath = ""
var prefixPath = ""
var hotKeyRef: EventHotKeyRef?

func quitGame() {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: wineserverPath)
    task.arguments = ["-k"]
    var env = ProcessInfo.processInfo.environment
    env["WINEPREFIX"] = prefixPath
    task.environment = env
    try? task.run()
}

func hotKeyHandler(_ call: EventHandlerCallRef?, _ event: EventRef?, _ data: UnsafeMutableRawPointer?) -> OSStatus {
    quitGame()
    return noErr
}

let args = CommandLine.arguments
if args.count < 3 { exit(2) }
wineserverPath = args[1]
prefixPath = args[2]

var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
InstallEventHandler(GetEventDispatcherTarget(), hotKeyHandler, 1, &spec, nil, nil)

let hotKeyID = EventHotKeyID(signature: OSType(0x474B3230), id: 1)
RegisterEventHotKey(UInt32(kVK_ANSI_Q), UInt32(cmdKey), hotKeyID, GetEventDispatcherTarget(), 0, &hotKeyRef)

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.run()
`;

/** Where the compiled Cmd+Q helper lives. */
export function quitHotkeyPath(): string {
  return join(binDir(), "quit-hotkey");
}

/**
 * Compile the Cmd+Q helper when it is missing. Returns its path, or `null` when
 * `swiftc` is unavailable or the build fails.
 */
export async function ensureQuitHotkey(): Promise<string | null> {
  const binary = quitHotkeyPath();
  if (exists(binary)) {
    return binary;
  }
  if (!which("swiftc")) {
    warn("swiftc not found — the Cmd+Q helper stays disabled (use: decanter quit)");
    return null;
  }
  if (isDryRun()) {
    log(`dry-run: compile the Cmd+Q helper into ${binary}`);
    return binary;
  }

  log("compiling the Cmd+Q helper (swiftc)");
  await mkdirp(dirname(binary));
  const source = join(dirname(binary), "quit-hotkey.swift");
  await writeText(source, SWIFT_SOURCE);
  const result = await exec("swiftc", ["-O", "-o", binary, source], { allowFailure: true });
  if (result.status !== 0) {
    warn("could not compile the Cmd+Q helper — use: decanter quit");
    return null;
  }

  return binary;
}
