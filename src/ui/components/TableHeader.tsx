import { Box, Text } from 'ink';
import { MIN_PATH_WIDTH } from '../layout.js';
import { COLUMN_GAP, COLUMN_WIDTHS, theme } from '../theme.js';

export function TableHeader({ showProject }: { showProject: boolean }) {
  return (
    <Box flexDirection="column">
      {/* Same column boxes (columnGap, flexShrink) as Row.tsx so labels
          line up with the cells beneath them — including under the resize
          race described in Row.tsx's comment. */}
      <Box columnGap={COLUMN_GAP} overflow="hidden">
        <Box width={COLUMN_WIDTHS.cursor} flexShrink={0} />
        <Box width={COLUMN_WIDTHS.check} flexShrink={0} />
        <Box width={COLUMN_WIDTHS.size} flexShrink={0}>
          <Text bold color={theme.accent}>
            {'SIZE'.padStart(COLUMN_WIDTHS.size)}
          </Text>
        </Box>
        <Box width={COLUMN_WIDTHS.kind} flexShrink={0}>
          <Text bold color={theme.accent}>
            TYPE
          </Text>
        </Box>
        <Box width={COLUMN_WIDTHS.name} flexShrink={0}>
          <Text bold color={theme.accent}>
            NAME
          </Text>
        </Box>
        {showProject && (
          <Box width={COLUMN_WIDTHS.project} flexShrink={0}>
            <Text bold color={theme.accent}>
              PROJECT
            </Text>
          </Box>
        )}
        <Box flexGrow={1} flexShrink={1} minWidth={MIN_PATH_WIDTH}>
          <Text bold color={theme.accent} wrap="truncate-end">
            PATH
          </Text>
        </Box>
      </Box>
      {/* A real border rule, not a JS-repeated string of '─' — Yoga sizes it
          to the actual (auto-updating-on-resize) row width for free. */}
      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
      />
    </Box>
  );
}
