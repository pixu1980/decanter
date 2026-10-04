// Console output shared by the CLI and the TUI.
//
// `die` throws a `CliError`; `cli.ts` is the only place that turns it into an
// exit code, so library code never calls `process.exit`.
//
// docs: docs/architecture.md

/** An expected, user-facing failure. */
export class CliError extends Error {}

/** Severity of one engine log line. */
export type LogLevel = "info" | "warn";

/** Receives engine output instead of the console (the TUI). */
export type LogSink = (line: string, level: LogLevel) => void;

let sink: LogSink | null = null;

/** Route engine output to `next`, or back to the console with `null`. */
export function setLogSink(next: LogSink | null): void {
  sink = next;
}

function write(line: string, level: LogLevel): void {
  if (sink) {
    sink(line, level);
    return;
  }
  if (level === "warn") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

/** Print `<tag>: <message>`. */
export function log(message: string): void {
  write(`${tag()}: ${message}`, "info");
}

/** Report `<tag>: <message>` as a warning. */
export function warn(message: string): void {
  write(`${tag()}: ${message}`, "warn");
}

/** Print a blank line followed by a heading. */
export function heading(message: string): void {
  write(`\n${message}`, "info");
}

/** Stop with a user-facing error. */
export function die(message: string): never {
  throw new CliError(message);
}

/** The prefix for log lines; `SM_TAG` overrides it. */
export function tag(): string {
  return process.env.SM_TAG ?? "steam-mac";
}

/** Throw when `condition` is false, with a user-facing message. */
export function require(condition: unknown, message: string): asserts condition {
  if (!condition) {
    die(message);
  }
}
