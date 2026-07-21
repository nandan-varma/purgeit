/**
 * Pure layout math shared between components that need to agree on sizing
 * (ArtifactList's viewport window and App.tsx's page-up/page-down size must
 * use the same "how many rows fit" answer, for example). Kept framework-free
 * so it's trivially unit-testable without rendering anything.
 */

/** Below this many terminal rows, still show at least this many entries. */
export const MIN_VISIBLE_ROWS = 3;

/**
 * Rough budget for everything around the table: the bordered header banner
 * (up to 4 rows incl. the "N selected" line), a blank line, the table's own
 * header + divider (2 rows), and the legend (up to 3 wrapped rows), plus a
 * little slack for warnings/margins. Deliberately conservative — better to
 * show slightly fewer rows than to overflow the terminal.
 */
const RESERVED_CHROME_ROWS = 13;

/** How many table rows fit in the given terminal height. */
export function computeVisibleRows(terminalRows: number): number {
  return Math.max(MIN_VISIBLE_ROWS, terminalRows - RESERVED_CHROME_ROWS);
}

/** Below this terminal width, drop the PROJECT column to give PATH more room. */
export const NARROW_TERMINAL_COLUMNS = 90;

/** Floor for the PATH column's flexGrow width, so it never collapses to nothing on a very narrow terminal. */
export const MIN_PATH_WIDTH = 12;
