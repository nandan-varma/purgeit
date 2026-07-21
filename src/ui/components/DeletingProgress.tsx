import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export function DeletingProgress({ deleted, failed }: { deleted: number; failed: number }) {
  return (
    <Box borderStyle="round" borderColor={theme.warning} paddingX={1} marginTop={1}>
      <Text bold color={theme.warning}>
        ⠋ Deleting…
      </Text>
      <Text>
        {' '}
        {deleted} deleted, {failed} failed
      </Text>
    </Box>
  );
}
