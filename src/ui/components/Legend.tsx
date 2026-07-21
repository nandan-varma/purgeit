import { Box, Text } from 'ink';
import { glyphs, theme } from '../theme.js';

export function Legend() {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>
        <Text color={theme.cursorBg}>{'  '}</Text> cursor{' '}
        <Text color={theme.selectedBg}>{'  '}</Text> selected{' '}
        <Text color={theme.gated}>{glyphs.bullet} gated</Text> (needs a sibling manifest)
        <Text> {glyphs.bullet} safe</Text> (always deletable)
      </Text>
      <Text dimColor>
        ↑/k ↓/j move · space toggle · a select all · n clear · i invert · s sort · r reverse · enter
        confirm · q quit
      </Text>
    </Box>
  );
}
