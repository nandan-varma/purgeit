import { Box, Text } from 'ink';
import { theme } from '../theme.js';
import { useSpinner } from '../useSpinner.js';

export function DeletingProgress({
  deleted,
  failed,
  dryRun,
}: {
  deleted: number;
  failed: number;
  dryRun: boolean;
}) {
  const spinner = useSpinner(true);

  return (
    // flexShrink={0}: see Header.tsx's comment.
    <Box borderStyle="round" borderColor={theme.warning} paddingX={1} marginTop={1} flexShrink={0}>
      <Text bold color={theme.warning} wrap="truncate-end">
        {spinner} {dryRun ? 'Simulating deletion…' : 'Deleting…'}
      </Text>
      <Text wrap="truncate-end">
        {' '}
        {deleted} deleted, {failed} failed
      </Text>
    </Box>
  );
}
