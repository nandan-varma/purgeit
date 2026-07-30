/**
 * Central color/glyph palette so every component agrees on what "selected"
 * vs "cursor" vs "gated" look like. Keep this the single place that maps
 * meaning -> color; components should not hardcode ANSI color names.
 */
export const theme = {
  accent: 'cyan',
  cursorBg: 'cyan',
  selectedBg: 'green',
  gated: 'yellow',
  safe: 'green',
  danger: 'red',
  warning: 'yellow',
  success: 'green',
} as const;

export const glyphs = {
  cursor: '❯',
  checkboxOn: '[✓]',
  checkboxOff: '[ ]',
  bullet: '•',
} as const;

/** Fixed column widths for the artifact table (everything but PATH, which flex-grows). */
export const COLUMN_WIDTHS = {
  cursor: 2,
  check: 4,
  size: 9,
  kind: 6,
  name: 18,
  project: 14,
  age: 5,
} as const;

/** Gap between adjacent table columns — pass to Box's `columnGap`, keep row/header widths in sync with it. */
export const COLUMN_GAP = 1;

const DAY_MS = 86_400_000;

/**
 * Maps an artifact's last-modified age to a "warmth" color: red for touched
 * within the last day (be careful), yellow for touched within the last
 * week, undefined (neutral/dim) for the ordinary middle ground, green for
 * anything untouched for 30+ days (a strong candidate for cleanup). `null`
 * (age not yet resolved, or unknown) is also neutral.
 */
export function ageColor(lastModified: number | null): string | undefined {
  if (lastModified === null) return undefined;
  const age = Date.now() - lastModified;
  if (age < DAY_MS) return theme.danger;
  if (age < 7 * DAY_MS) return theme.warning;
  if (age >= 30 * DAY_MS) return theme.safe;
  return undefined;
}
