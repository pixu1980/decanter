#!/usr/bin/env node
// Build the changelog from the Conventional Commits.
//
// `pnpm changelog` prints the whole file, `pnpm changelog --write` writes
// CHANGELOG.md, and `--tag <t>` prints one release's section for the release
// job. Generation belongs to the release tag, never to a commit hook.
//
// docs: CONTRIBUTING.md

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderChangelog, renderSection } from "../src/core/changelog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `git ${args.join(" ")} failed\n`);
    process.exit(1);
  }
  return result.stdout.trim();
}

function commits(range) {
  return git(["log", "--format=%h\t%s", range])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split("\t");
      return { hash, subject: rest.join("\t") };
    });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tagDate(tag) {
  return git(["log", "-1", "--format=%ad", "--date=short", tag]) || today();
}

const args = process.argv.slice(2);
function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const tags = git(["tag", "--sort=creatordate"]).split("\n").filter(Boolean);
const onlyTag = flag("--tag");
const toFile = flag("--out") ?? (args.includes("--write") ? join(root, "CHANGELOG.md") : undefined);

let output;
if (onlyTag) {
  const index = tags.indexOf(onlyTag);
  const previous = index > 0 ? tags[index - 1] : "";
  output = `${renderSection(onlyTag, tagDate(onlyTag), commits(previous ? `${previous}..${onlyTag}` : onlyTag))}\n`;
} else {
  const sections = tags.map((tag, index) => {
    const previous = index > 0 ? tags[index - 1] : "";
    return { version: tag, date: tagDate(tag), commits: commits(previous ? `${previous}..${tag}` : tag) };
  });
  const lastTag = tags.at(-1);
  const unreleased = commits(lastTag ? `${lastTag}..HEAD` : "HEAD");
  if (unreleased.length > 0 || tags.length === 0) {
    sections.push({ version: "Unreleased", date: today(), commits: unreleased });
  }
  output = renderChangelog(sections.reverse());
}

if (toFile) {
  writeFileSync(toFile, output);
  process.stdout.write(`${output.length} bytes -> ${toFile}\n`);
} else {
  process.stdout.write(output);
}
