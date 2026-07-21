import { Box, Text } from 'ink';
import { theme } from '../theme.js';
import { useSpinner } from '../useSpinner.js';

export function DeletingProgress({ deleted, failed }: { deleted: number; failed: number }) {
  const spinner = useSpinner(true);

  return (
    <Box borderStyle="round" borderColor={theme.warning} paddingX={1} marginTop={1}>
      <Text bold color={theme.warning} wrap="truncate-end">
        {spinner} Deleting…
      </Text>
      <Text wrap="truncate-end">
        {' '}
        {deleted} deleted, {failed} failed
      </Text>
    </Box>
  );
}
