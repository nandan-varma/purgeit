import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { fmtAge, fmtSize } from '../format.js';
import { computeVisibleRows } from '../layout.js';
import type { AppState } from '../state.js';
import { projectGroups } from '../state.js';
import { glyphs, theme } from '../theme.js';
import { useTerminalSize } from '../useTerminalSize.js';

/** A compact overview that answers where cleanup matters before showing files. */
export function ProjectList({ state }: { state: AppState }) {
  const { rows } = useTerminalSize();
  const visibleRows = computeVisibleRows(rows);
  // biome-ignore lint/correctness/useExhaustiveDependencies: groups depend only on entries and direction
  const groups = useMemo(() => projectGroups(state), [state.entries, state.sortDir]);
  const maxStart = Math.max(0, groups.length - visibleRows);
  const start = Math.max(0, Math.min(state.cursor - Math.floor(visibleRows / 2), maxStart));
  const visible = groups.slice(start, start + visibleRows);
  const hiddenAfter = groups.length - start - visible.length;

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        {'SIZE'.padStart(9)} ITEMS LAST USED PROJECT
      </Text>
      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
      />
      {start > 0 && (
        <Text color={theme.accent} dimColor>
          ↑ {start} more projects above
        </Text>
      )}
      {visible.map((group, index) => {
        const cursor = start + index === state.cursor;
        const selectedCount = group.entries.filter((entry) =>
          state.selected.has(entry.path),
        ).length;
        const allSelected = selectedCount === group.entries.length;
        const rowBg = allSelected ? theme.selectedBg : cursor ? theme.cursorBg : undefined;
        const topArtifacts = group.entries
          .slice()
          .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
          .slice(0, 2)
          .map((entry) => entry.ruleName)
          .join(', ');
        return (
          <Box key={group.name} backgroundColor={rowBg} overflow="hidden">
            <Text bold={cursor}>{cursor ? glyphs.cursor : ' '}</Text>
            <Text>
              {allSelected ? glyphs.checkboxOn : selectedCount > 0 ? '[-]' : glyphs.checkboxOff}
            </Text>
            <Text bold>{fmtSize(group.totalSize).padStart(9)}</Text>
            <Text> {String(group.entries.length).padStart(3)} </Text>
            <Text>{fmtAge(group.newestModified).padEnd(9)}</Text>
            <Text bold wrap="truncate-end">
              {group.name} <Text dimColor>· {topArtifacts}</Text>
            </Text>
          </Box>
        );
      })}
      {hiddenAfter > 0 && (
        <Text color={theme.accent} dimColor>
          ↓ {hiddenAfter} more projects below
        </Text>
      )}
    </Box>
  );
}
