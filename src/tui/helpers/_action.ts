// Run a lifecycle action from the TUI without corrupting the frame.
//
// Lifecycle code writes progress to `process.stdout`/`stderr`. The renderer
// draws through its own native writer, so capturing those streams keeps the
// interface clean while still returning the last message to the status bar.
//
// docs: docs/architecture.md

import { CliError } from "../../core/log.ts";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Run `fn`, capturing console output; never throws. */
export async function safeAction(fn: () => Promise<unknown>): Promise<ActionResult> {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const captured: string[] = [];

  process.stdout.write = ((chunk: unknown) => {
    captured.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    captured.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
    return { ok: true, message: lastLine(captured) || "done" };
  } catch (error) {
    const message = error instanceof CliError ? error.message : (error as Error).message;
    return { ok: false, message };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

function lastLine(lines: string[]): string {
  const text = lines.join("").trimEnd();
  const parts = text.split("\n").filter(Boolean);
  return parts.at(-1) ?? "";
}
