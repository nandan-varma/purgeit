import { Box, Text } from 'ink';
import { fmtSize } from '../format.js';
import type { AppState } from '../state.js';
import { theme } from '../theme.js';

export function DoneSummary({ state, dryRun }: { state: AppState; dryRun: boolean }) {
  if (state.entries.length === 0 && state.scanDone) {
    return (
      <Box borderStyle="round" borderColor={theme.accent} paddingX={1} marginTop={1} flexShrink={0}>
        <Text>Nothing to clean — this directory looks tidy.</Text>
      </Box>
    );
  }

  if (state.deletion) {
    const totalBytes = state.entries
      .filter((e) => state.selected.has(e.path))
      .reduce((sum, e) => sum + (e.size ?? 0), 0);
    const hasFailures = state.deletion.failed > 0;
    return (
      <Box
        borderStyle="round"
        borderColor={hasFailures ? theme.danger : theme.success}
        paddingX={1}
        flexDirection="column"
        marginTop={1}
        flexShrink={0}
      >
        <Text bold color={hasFailures ? theme.danger : theme.success}>
          {hasFailures ? '✗' : '✓'} Done{dryRun ? ' (dry-run)' : ''}
        </Text>
        <Text wrap="truncate-end">
          {state.deletion.deleted} deleted, {state.deletion.failed} failed
          {state.deletion.deleted > 0 &&
            ` — ${fmtSize(totalBytes)} ${dryRun ? 'would be freed' : 'freed'}`}
        </Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor={theme.accent} paddingX={1} marginTop={1} flexShrink={0}>
      <Text dimColor>Quit — nothing was deleted.</Text>
    </Box>
  );
}
