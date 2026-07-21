import { Box, Text } from 'ink';
import { COLUMN_GAP, COLUMN_WIDTHS, theme } from '../theme.js';

export function TableHeader({ pathWidth }: { pathWidth: number }) {
  const totalWidth =
    COLUMN_WIDTHS.cursor +
    COLUMN_WIDTHS.check +
    COLUMN_WIDTHS.size +
    COLUMN_WIDTHS.kind +
    COLUMN_WIDTHS.name +
    COLUMN_WIDTHS.project +
    pathWidth +
    COLUMN_GAP * 6;

  return (
    <Box flexDirection="column">
      {/* Same 7 boxes as Row.tsx (cursor/check split, not merged) so the
          columnGap-driven alignment matches exactly. */}
      <Box columnGap={COLUMN_GAP}>
        <Box width={COLUMN_WIDTHS.cursor} />
        <Box width={COLUMN_WIDTHS.check} />
        <Box width={COLUMN_WIDTHS.size}>
          <Text bold color={theme.accent}>
            {'SIZE'.padStart(COLUMN_WIDTHS.size)}
          </Text>
        </Box>
        <Box width={COLUMN_WIDTHS.kind}>
          <Text bold color={theme.accent}>
            TYPE
          </Text>
        </Box>
        <Box width={COLUMN_WIDTHS.name}>
          <Text bold color={theme.accent}>
            NAME
          </Text>
        </Box>
        <Box width={COLUMN_WIDTHS.project}>
          <Text bold color={theme.accent}>
            PROJECT
          </Text>
        </Box>
        <Box width={pathWidth}>
          <Text bold color={theme.accent}>
            PATH
          </Text>
        </Box>
      </Box>
      <Text dimColor>{'─'.repeat(Math.max(0, totalWidth))}</Text>
    </Box>
  );
}
