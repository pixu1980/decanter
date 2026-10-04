// The actions a game detail screen can run.
//
// Kept apart from the view so the app shell, the detail screen and the tests
// all read the same ordered list, and so the destructive actions are declared
// in exactly one place.
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
  { key: "setup", label: "Setup", hint: "runtime, prefix, icon, bundle", group: "Setup" },
  { key: "download", label: "Download", hint: "SteamCMD, or the Steam console", group: "Setup" },
  { key: "import", label: "Import", hint: "move the depot into the prefix", group: "Setup" },
  { key: "update", label: "Update", hint: "check and install", group: "Setup" },
  { key: "app", label: "Rebuild app", hint: "bundle with menu and Cmd+Q", group: "Setup" },
  { key: "icon", label: "Fetch icon", hint: "from the Steam CDN", group: "Setup" },
  { key: "doctor", label: "Doctor", hint: "health checks", group: "Inspect" },
  { key: "logs", label: "Logs", hint: "tail the game log", group: "Inspect" },
  { key: "saves", label: "Open saves", hint: "in Finder", group: "Inspect" },
  { key: "backup", label: "Backup saves", hint: "to ~/Documents", group: "Inspect" },
  { key: "uninstall", label: "Uninstall", hint: "remove the app bundle", group: "Danger" },
];

/** Actions that need an in-app confirmation before they run. */
export const DESTRUCTIVE = new Set(["uninstall"]);
