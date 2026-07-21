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
} as const;

/** Gap between adjacent table columns — pass to Box's `columnGap`, keep row/header widths in sync with it. */
export const COLUMN_GAP = 1;
