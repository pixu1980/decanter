// The first-run wizard: collect every credential the engine reads.
//
// The source ships no credential; `decanter init` (CLI) and the TUI screen it
// opens both drive this list, so the fields live in one place and the two
// surfaces cannot drift.
//
// docs: docs/managing.md

import { CREDENTIAL_FIELDS, loadConfig, saveConfig, type Config, type CredentialField } from "./config.ts";

/** One wizard row: a credential field and its current value. */
export interface WizardRow {
  field: CredentialField;
  value: string;
}

/** The wizard rows for a config, in field order. */
export function wizardRows(config: Config): WizardRow[] {
  return CREDENTIAL_FIELDS.map((field) => ({ field, value: field.get(config) }));
}

/** Apply `id -> value` answers onto a copy of the config, trimming each value. */
export function applyAnswers(config: Config, answers: Record<string, string>): Config {
  const next = structuredClone(config);
  for (const field of CREDENTIAL_FIELDS) {
    const value = answers[field.id];
    if (value !== undefined) {
      field.apply(next, value.trim());
    }
  }
  return next;
}

/** Persist one credential value and return the saved config. */
export async function setCredential(id: string, value: string): Promise<Config> {
  const field = CREDENTIAL_FIELDS.find((candidate) => candidate.id === id);
  if (!field) {
    throw new Error(`unknown credential: ${id}`);
  }
  const config = await loadConfig();
  field.apply(config, value.trim());
  await saveConfig(config);
  return config;
}
