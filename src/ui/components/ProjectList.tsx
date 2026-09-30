import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { fmtAge, fmtSize } from '../format.js';
import { computeVisibleRows, MIN_PATH_WIDTH } from '../layout.js';
import type { AppState } from '../state.js';
import { projectGroups } from '../state.js';
import { ageColor, COLUMN_GAP, glyphs, PROJECT_COLUMN_WIDTHS, theme } from '../theme.js';
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
      <Box columnGap={COLUMN_GAP} overflow="hidden">
        <Box width={PROJECT_COLUMN_WIDTHS.cursor} flexShrink={0} />
        <Box width={PROJECT_COLUMN_WIDTHS.check} flexShrink={0} />
        <Box width={PROJECT_COLUMN_WIDTHS.size} flexShrink={0}>
          <Text bold color={theme.accent}>
            {'SIZE'.padStart(PROJECT_COLUMN_WIDTHS.size)}
          </Text>
        </Box>
        <Box width={PROJECT_COLUMN_WIDTHS.items} flexShrink={0}>
          <Text bold color={theme.accent}>
            ITEMS
          </Text>
        </Box>
        <Box width={PROJECT_COLUMN_WIDTHS.age} flexShrink={0}>
          <Text bold color={theme.accent}>
            AGE
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={MIN_PATH_WIDTH}>
          <Text bold color={theme.accent} wrap="truncate-end">
            PROJECT · LARGEST ARTIFACTS
          </Text>
        </Box>
      </Box>
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
        const dim = !rowBg;
        const ageColorValue = ageColor(group.newestModified);
        const topArtifacts = group.entries
          .slice()
          .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
          .slice(0, 2)
          .map((entry) => entry.ruleName)
          .join(', ');
        return (
          <Box key={group.name} backgroundColor={rowBg} columnGap={COLUMN_GAP} overflow="hidden">
            <Box width={PROJECT_COLUMN_WIDTHS.cursor} flexShrink={0}>
              <Text bold={cursor}>{cursor ? glyphs.cursor : ' '}</Text>
            </Box>
            <Box width={PROJECT_COLUMN_WIDTHS.check} flexShrink={0}>
              <Text>
                {allSelected ? glyphs.checkboxOn : selectedCount > 0 ? '[-]' : glyphs.checkboxOff}
              </Text>
            </Box>
            <Box width={PROJECT_COLUMN_WIDTHS.size} flexShrink={0}>
              <Text bold>{fmtSize(group.totalSize).padStart(PROJECT_COLUMN_WIDTHS.size)}</Text>
            </Box>
            <Box width={PROJECT_COLUMN_WIDTHS.items} flexShrink={0}>
              <Text>{String(group.entries.length).padStart(5)}</Text>
            </Box>
            <Box width={PROJECT_COLUMN_WIDTHS.age} flexShrink={0}>
              <Text
                {...(ageColorValue !== undefined ? { color: ageColorValue } : {})}
                dimColor={dim && ageColorValue === undefined}
              >
                {fmtAge(group.newestModified)}
              </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1} minWidth={MIN_PATH_WIDTH}>
              <Text bold wrap="truncate-end">
                {group.name} <Text dimColor>· {topArtifacts}</Text>
              </Text>
            </Box>
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
