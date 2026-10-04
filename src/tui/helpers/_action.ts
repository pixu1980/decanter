// Run a lifecycle action from the TUI without corrupting the frame.
//
// Lifecycle code writes progress through the logger. The renderer draws through
// its own native writer, so this routes those lines to the activity panel while
// still returning the last message to the status bar.
//
// docs: docs/architecture.md

import { CancelledError, resetCancel } from "../../core/exec.ts";
import { CliError, setLogSink, type LogLevel } from "../../core/log.ts";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Run `fn`, streaming engine output to `onLine`; never throws. */
export async function safeAction(
  fn: () => Promise<unknown>,
  onLine?: (line: string, level: LogLevel) => void,
): Promise<ActionResult> {
  const captured: string[] = [];
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  resetCancel();
  setLogSink((line, level) => {
    captured.push(`${line}\n`);
    onLine?.(line, level);
  });
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
    if (error instanceof CancelledError) {
      return { ok: false, message: "cancelled" };
    }
    const message = error instanceof CliError ? error.message : (error as Error).message;
    return { ok: false, message };
  } finally {
    setLogSink(null);
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

function lastLine(lines: string[]): string {
  const text = lines.join("").trimEnd();
  const parts = text.split("\n").filter(Boolean);
  return parts.at(-1) ?? "";
}
