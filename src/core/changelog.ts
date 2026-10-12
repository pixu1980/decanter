// Render a changelog from the Conventional Commits.
//
// The commits are the single record; this only regroups them. `feat`, `fix`,
// `perf`, `refactor`, `revert` and `docs` earn an entry; `chore`, `ci`, `build`,
// `test` and `style` stay in the git log. Generation runs at the release tag
// (`bin/changelog.mjs`), never from a commit hook, so the file changes once per
// release and never conflicts across branches.
//
// docs: CONTRIBUTING.md

/** One commit, as `git log` reports it. */
export interface CommitEntry {
  hash: string;
  subject: string;
}

/** A parsed `type(scope): subject` commit. */
export interface ParsedCommit {
  hash: string;
  type: string;
  scope: string;
  subject: string;
  breaking: boolean;
}

/** Commit type to changelog section. */
const SECTIONS: Record<string, string> = {
  feat: "Added",
  fix: "Fixed",
  perf: "Changed",
  refactor: "Changed",
  revert: "Removed",
  docs: "Documentation",
};

/** Section order in the rendered output. */
const ORDER = ["Added", "Changed", "Fixed", "Removed", "Documentation"];

/**
 * Clean the rendered subject: history is immutable, the rendered line is not.
 * Drop the typographic characters and the host-name spelling house style
 * rejects, so the generated file passes the prose rules the source keeps.
 */
export function cleanSubject(subject: string): string {
  return subject
    .replace(/ — /g, ", ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/GOG\.com/g, "GOG");
}

const HEADER = `# Changelog

All notable changes to this project. Generated from the commits by
\`pnpm changelog\`; \`chore\`, \`ci\`, \`build\`, \`test\` and \`style\` commits earn no
entry but stay in the git log.
`;

/** Parse `type(scope): subject`; returns `null` for anything else. */
export function parseCommit(hash: string, subject: string): ParsedCommit | null {
  const match = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\(([a-z0-9._-]+)\)(!?): (.+)$/.exec(
    subject,
  );
  if (!match) {
    return null;
  }
  return {
    hash: hash.slice(0, 7),
    type: match[1]!,
    scope: match[2]!,
    breaking: match[3] === "!",
    subject: match[4]!,
  };
}

/** Render one `version - date` section from its commits. */
export function renderSection(version: string, date: string, commits: CommitEntry[]): string {
  const groups = new Map<string, string[]>();
  for (const commit of commits) {
    const parsed = parseCommit(commit.hash, commit.subject);
    if (!parsed) {
      continue;
    }
    const title = SECTIONS[parsed.type];
    if (!title) {
      continue;
    }
    const line = `- ${parsed.breaking ? "**BREAKING** " : ""}**${parsed.scope}**: ${cleanSubject(parsed.subject)} (\`${parsed.hash}\`)`;
    groups.set(title, [...(groups.get(title) ?? []), line]);
  }
  const body = ORDER.filter((title) => groups.has(title))
    .map((title) => `### ${title}\n\n${groups.get(title)!.join("\n")}`)
    .join("\n\n");

  return `## ${version} - ${date}\n\n${body || "No user-facing changes."}`;
}

/** Render the full changelog from the newest section first. */
export function renderChangelog(
  sections: Array<{ version: string; date: string; commits: CommitEntry[] }>,
): string {
  const body = sections.map((section) => renderSection(section.version, section.date, section.commits));
  return `${HEADER}\n${body.join("\n\n")}\n`;
}
