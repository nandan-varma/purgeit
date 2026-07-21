import { basename } from 'node:path';
import { Box, Text } from 'ink';
import type { ScanEntry } from '../../scan/scanner.js';
import { fmtSize } from '../format.js';
import { MIN_PATH_WIDTH } from '../layout.js';
import { COLUMN_GAP, COLUMN_WIDTHS, glyphs, theme } from '../theme.js';

export function Row({
  entry,
  cursor,
  index,
  selected,
  showProject,
}: {
  entry: ScanEntry;
  cursor: number;
  index: number;
  selected: boolean;
  showProject: boolean;
}) {
  const isCursor = index === cursor;
  // Selection wins over cursor when both are true — a green row is the
  // strongest signal ("this will be deleted"); the cursor glyph itself still
  // shows which row is current either way.
  const rowBg = selected ? theme.selectedBg : isCursor ? theme.cursorBg : undefined;
  const dim = !rowBg;
  // entry.project is a bare name in 'projects' mode but the full scan root
  // path in 'flat' mode (see scan/scanner.ts) — basename() normalizes both
  // to something short enough for a fixed-width column.
  const project = entry.project ? `(${basename(entry.project)})` : '';

  // Ink Box defaults to flexShrink: 1, so a "fixed" width column would
  // otherwise still get squeezed (and its Text wrapped, since only the path
  // column opts into truncation) whenever content briefly outgrows the
  // terminal — most visibly right after a resize, where Ink's own
  // synchronous internal layout recalculation can run a beat before
  // useTerminalSize's React state update (and therefore showProject/etc.)
  // catches up. flexShrink={0} keeps every column here at its intended
  // width no matter what; overflow="hidden" on the row makes the worst case
  // "briefly clipped at the edge", not "wrapped into a multi-line mess".
  return (
    <Box backgroundColor={rowBg} columnGap={COLUMN_GAP} overflow="hidden">
      <Box width={COLUMN_WIDTHS.cursor} flexShrink={0}>
        <Text bold={isCursor}>{isCursor ? glyphs.cursor : ' '}</Text>
      </Box>
      <Box width={COLUMN_WIDTHS.check} flexShrink={0}>
        <Text bold={selected}>{selected ? glyphs.checkboxOn : glyphs.checkboxOff}</Text>
      </Box>
      <Box width={COLUMN_WIDTHS.size} flexShrink={0}>
        <Text bold>{fmtSize(entry.size).padStart(COLUMN_WIDTHS.size)}</Text>
      </Box>
      <Box width={COLUMN_WIDTHS.kind} flexShrink={0}>
        {entry.kind === 'gated' ? (
          <Text color={theme.gated}>gated</Text>
        ) : (
          <Text dimColor={dim}>safe</Text>
        )}
      </Box>
      <Box width={COLUMN_WIDTHS.name} flexShrink={0}>
        <Text wrap="truncate-end">{entry.ruleName}</Text>
      </Box>
      {showProject && (
        <Box width={COLUMN_WIDTHS.project} flexShrink={0}>
          <Text dimColor={dim} wrap="truncate-end">
            {project}
          </Text>
        </Box>
      )}
      {/* flexGrow (not a JS-computed width) so this — and the ellipsis
          truncation point — stays correct across a terminal resize without
          needing a React re-render; wrap="truncate-start" keeps the
          meaningful tail of the path (the artifact's own directory) visible
          rather than the root prefix. */}
      <Box flexGrow={1} flexShrink={1} minWidth={MIN_PATH_WIDTH}>
        <Text dimColor={dim} wrap="truncate-start">
          {entry.path}
        </Text>
      </Box>
    </Box>
  );
}
