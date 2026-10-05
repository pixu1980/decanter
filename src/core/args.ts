// Command-line parsing.
//
// The CLI is `decanter <command> [slug] [--flags]`. Flags may appear anywhere,
// which keeps shell completion and muscle memory simple.
//
// docs: README.md

/** Flags that take a value. */
const VALUE_FLAGS = new Set(["appid", "depot", "slug", "exe", "runtime", "store", "gog-id", "installer", "n", "prefix", "steam-root"]);

/** Parsed command line. */
export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/** Split argv into a command, positionals and flags. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command = "";

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const [name, inline] = token.slice(2).split("=", 2) as [string, string | undefined];
      if (inline !== undefined) {
        flags[name] = inline;
      } else if (VALUE_FLAGS.has(name)) {
        flags[name] = argv[++i] ?? "";
      } else {
        flags[name] = true;
      }
      continue;
    }
    if (token === "-y") {
      flags.yes = true;
      continue;
    }
    if (token === "-n") {
      flags.n = argv[++i] ?? "";
      continue;
    }
    if (token === "-h") {
      flags.help = true;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      flags[token.slice(1)] = true;
      continue;
    }
    if (!command) {
      command = token;
    } else {
      positionals.push(token);
    }
  }

  return { command, positionals, flags };
}

/** Read a string flag. */
export function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

/** Read a numeric flag. */
export function flagNumber(flags: Record<string, string | boolean>, name: string): number | undefined {
  const value = flagString(flags, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Read a boolean flag. */
export function flagBool(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true || flags[name] === "true";
}
