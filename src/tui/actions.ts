// The actions a game detail screen can run.
//
// Kept apart from the view so the app shell, the detail screen and the tests
// all read the same ordered list, and so the destructive actions are declared
// in exactly one place. The list mirrors the per-game CLI commands, including
// the flag variants (`download --manual`, `update --check`, `uninstall` vs
// `remove`).
//
// docs: docs/architecture.md

/** One selectable action. */
export interface ActionItem {
  key: string;
  label: string;
  hint: string;
  group: string;
}

/** The actions, in the order the detail screen shows them. */
export const ACTIONS: ActionItem[] = [
  { key: "run", label: "Run", hint: "open the app bundle", group: "Play" },
  { key: "quit", label: "Stop", hint: "end the running game", group: "Play" },
  { key: "windowed", label: "Windowed", hint: "native macOS window", group: "Play" },
  { key: "fullscreen", label: "Fullscreen", hint: "borderless fullscreen", group: "Play" },
  { key: "setup", label: "Setup", hint: "runtime, prefix, icon, bundle", group: "Setup" },
  { key: "download", label: "Download", hint: "SteamCMD, or the Steam console", group: "Setup" },
  { key: "download-manual", label: "Download (manual)", hint: "drive the Steam console", group: "Setup" },
  { key: "import", label: "Import", hint: "move the depot into the prefix", group: "Setup" },
  { key: "import-installer", label: "Import installer", hint: "GOG offline setup.exe (Terminal)", group: "Setup" },
  { key: "update", label: "Update", hint: "check and install", group: "Setup" },
  { key: "update-check", label: "Check update", hint: "report only (exit 3)", group: "Setup" },
  { key: "app", label: "Rebuild app", hint: "bundle with menu and Cmd+Q", group: "Setup" },
  { key: "icon", label: "Fetch icon", hint: "from the store CDN", group: "Setup" },
  { key: "runtime-upgrade", label: "Upgrade runtime", hint: "newest Wine / D3DMetal", group: "Setup" },
  { key: "runtime-rollback", label: "Roll back runtime", hint: "previous known-good", group: "Setup" },
  { key: "steam-setup", label: "Install Windows Steam", hint: "into the prefix (optional)", group: "Setup" },
  { key: "steam", label: "Launch Windows Steam", hint: "opens in Terminal", group: "Setup" },
  { key: "runtime", label: "Runtime", hint: "Wine + Direct3D stack", group: "Inspect" },
  { key: "doctor", label: "Doctor", hint: "health checks", group: "Inspect" },
  { key: "logs", label: "Logs", hint: "tail the game log", group: "Inspect" },
  { key: "saves", label: "Open saves", hint: "in Finder", group: "Inspect" },
  { key: "mods", label: "Open mods", hint: "in Finder", group: "Inspect" },
  { key: "backup", label: "Backup saves", hint: "to ~/.decanter/backups", group: "Inspect" },
  { key: "edit", label: "Edit profile", hint: "open game.json", group: "Inspect" },
  { key: "uninstall", label: "Uninstall app", hint: "remove the bundle, keep data", group: "Danger" },
  { key: "remove", label: "Remove game", hint: "purge the prefix and forget it", group: "Danger" },
];

/** Actions that need an in-app confirmation before they run. */
export const DESTRUCTIVE = new Set(["uninstall", "remove"]);
