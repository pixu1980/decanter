// Console output shared by the CLI and the TUI.
//
// `die` throws a `CliError`; `cli.ts` is the only place that turns it into an
// exit code, so library code never calls `process.exit`.
//
// docs: docs/architecture.md

/** An expected, user-facing failure. */
export class CliError extends Error {}

/** Print `<tag>: <message>` on stdout. */
export function log(message: string): void {
  process.stdout.write(`${tag()}: ${message}\n`);
}

/** Print `<tag>: <message>` on stderr. */
export function warn(message: string): void {
  process.stderr.write(`${tag()}: ${message}\n`);
}

/** Print a blank line followed by a heading. */
export function heading(message: string): void {
  process.stdout.write(`\n${message}\n`);
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
