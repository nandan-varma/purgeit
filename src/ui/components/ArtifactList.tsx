import { Box, Text } from 'ink';
import { computeVisibleRows, NARROW_TERMINAL_COLUMNS } from '../layout.js';
import type { AppState } from '../state.js';
import { sortedEntries } from '../state.js';
import { theme } from '../theme.js';
import { useTerminalSize } from '../useTerminalSize.js';
import { Row } from './Row.js';
import { TableHeader } from './TableHeader.js';

export function ArtifactList({ state }: { state: AppState }) {
  const { columns, rows } = useTerminalSize();
  const showProject = columns >= NARROW_TERMINAL_COLUMNS;
  const visibleRows = computeVisibleRows(rows);
  const entries = sortedEntries(state);

  // Center the viewport on the cursor so moving past the visible window
  // keeps the highlighted row visible instead of scrolling off-screen.
  const maxStart = Math.max(0, entries.length - visibleRows);
  const start = Math.max(0, Math.min(state.cursor - Math.floor(visibleRows / 2), maxStart));
  const visible = entries.slice(start, start + visibleRows);
  const hiddenAfter = entries.length - start - visible.length;

  return (
    <Box flexDirection="column">
      <TableHeader showProject={showProject} />
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
          showProject={showProject}
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
