import { Box, Text, useStdout } from 'ink';
import type { AppState } from '../state.js';
import { sortedEntries } from '../state.js';
import { FIXED_COLUMNS_WIDTH, MIN_PATH_WIDTH, theme } from '../theme.js';
import { Row } from './Row.js';
import { TableHeader } from './TableHeader.js';

const VISIBLE_ROWS = 30;

export function ArtifactList({ state }: { state: AppState }) {
  const { stdout } = useStdout();
  const pathWidth = Math.max(MIN_PATH_WIDTH, (stdout.columns || 80) - FIXED_COLUMNS_WIDTH);
  const entries = sortedEntries(state);

  // Center the viewport on the cursor so moving past row 30 keeps the
  // highlighted row visible instead of scrolling off-screen.
  const maxStart = Math.max(0, entries.length - VISIBLE_ROWS);
  const start = Math.max(0, Math.min(state.cursor - Math.floor(VISIBLE_ROWS / 2), maxStart));
  const visible = entries.slice(start, start + VISIBLE_ROWS);
  const hiddenAfter = entries.length - start - visible.length;

  return (
    <Box flexDirection="column">
      <TableHeader pathWidth={pathWidth} />
      {start > 0 && (
        <Text color={theme.accent} dimColor>
          ↑ {start} more above
        </Text>
      )}
      {visible.map((entry, i) => (
        <Row
          key={entry.path}
          entry={entry}
          cursor={state.cursor}
          index={start + i}
          selected={state.selected.has(entry.path)}
          pathWidth={pathWidth}
        />
      ))}
      {hiddenAfter > 0 && (
        <Text color={theme.accent} dimColor>
          ↓ {hiddenAfter} more below
        </Text>
      )}
    </Box>
  );
}
