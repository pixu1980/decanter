// Palette and glyphs shared by every screen.
//
// OpenTUI styles components through props (ADR 002), so this module is the one
// place that owns colours. Screens read from here instead of hard-coding hex
// values, which keeps the interface visually consistent.
//
// docs: docs/architecture.md

/** The interface palette. */
export const theme = {
  text: "#c8ccd4",
  strong: "#ffffff",
  muted: "#6b7280",
  faint: "#4b5563",
  accent: "#61afef",
  success: "#98c379",
  warning: "#e5c07b",
  danger: "#e06c75",
  border: "#3c4048",
  borderActive: "#61afef",
  selection: "#2f3b52",
  panel: "#1b1f27",
} as const;

/** Glyphs used across the screens. */
export const symbols = {
  pointer: "▶",
  chevron: "›",
  dotOn: "●",
  dotOff: "○",
} as const;

/** The tone of a status-bar message. */
export type Tone = "success" | "error" | "busy" | "info";

/** Classify a status-bar message by its prefix. */
export function toneOf(message: string, busy: boolean): Tone {
  if (busy) {
    return "busy";
  }
  if (message.startsWith("error:")) {
    return "error";
  }
  if (message === "ready") {
    return "info";
  }

  return "success";
}

/** The colour for a tone. */
export function toneColor(tone: Tone): string {
  if (tone === "error") {
    return theme.danger;
  }
  if (tone === "busy") {
    return theme.warning;
  }
  if (tone === "info") {
    return theme.muted;
  }

  return theme.success;
}
