import { basename } from 'node:path';
import { Box, Text } from 'ink';
import type { ScanEntry } from '../../scan/scanner.js';
import { fmtSize, truncatePath } from '../format.js';
import { COLUMN_GAP, COLUMN_WIDTHS, glyphs, theme } from '../theme.js';

export function Row({
  entry,
  cursor,
  index,
  selected,
  pathWidth,
}: {
  entry: ScanEntry;
  cursor: number;
  index: number;
  selected: boolean;
  pathWidth: number;
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

  return (
    <Box backgroundColor={rowBg} columnGap={COLUMN_GAP}>
      <Box width={COLUMN_WIDTHS.cursor}>
        <Text bold={isCursor}>{isCursor ? glyphs.cursor : ' '}</Text>
      </Box>
      <Box width={COLUMN_WIDTHS.check}>
        <Text bold={selected}>{selected ? glyphs.checkboxOn : glyphs.checkboxOff}</Text>
      </Box>
      <Box width={COLUMN_WIDTHS.size}>
        <Text bold>{fmtSize(entry.size).padStart(COLUMN_WIDTHS.size)}</Text>
      </Box>
      <Box width={COLUMN_WIDTHS.kind}>
        {entry.kind === 'gated' ? (
          <Text color={theme.gated}>gated</Text>
        ) : (
          <Text dimColor={dim}>safe</Text>
        )}
      </Box>
      <Box width={COLUMN_WIDTHS.name}>
        <Text wrap="truncate-end">{entry.ruleName}</Text>
      </Box>
      <Box width={COLUMN_WIDTHS.project}>
        <Text dimColor={dim} wrap="truncate-end">
          {project}
        </Text>
      </Box>
      <Box width={pathWidth}>
        <Text dimColor={dim} wrap="truncate-end">
          {truncatePath(entry.path, pathWidth)}
        </Text>
      </Box>
    </Box>
  );
}
