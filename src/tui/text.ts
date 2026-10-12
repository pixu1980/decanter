// Text helpers that keep a component inside its width.
//
// OpenTUI lays out a fixed-width box but does not clip the text inside it, so a
// long label or hint is drawn over its neighbour. Every component measures the
// space it has and truncates its own lines.

/** Cut `value` to `width` cells, appending an ellipsis when it does not fit. */
export function truncate(value: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (value.length <= width) {
    return value;
  }
  return width === 1 ? "…" : `${value.slice(0, width - 1)}…`;
}

/** Pad `value` (already truncated) with spaces, so the row repaints every cell. */
export function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width);
}
