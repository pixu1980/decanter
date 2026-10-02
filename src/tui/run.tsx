// OpenTUI bootstrap.
//
// Loaded only when the interface is requested, so plain CLI commands never pay
// for the native renderer. The renderer owns terminal restoration; `q` or
// Ctrl+C destroys it and unmounts the React tree.
//
// docs: docs/architecture.md

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App/index.ts";

/** Start the interface. */
export async function runTui(): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  const root = createRoot(renderer);
  root.render(<App />);
}
