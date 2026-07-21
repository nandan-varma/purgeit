import { basename } from 'node:path';
import { Box, Text } from 'ink';
import { fmtSize } from '../format.js';
import type { AppState } from '../state.js';
import { theme } from '../theme.js';

const PREVIEW_LIMIT = 5;

export function ConfirmDialog({ state }: { state: AppState }) {
  const selectedEntries = state.entries
    .filter((e) => state.selected.has(e.path))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const totalBytes = selectedEntries.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const preview = selectedEntries.slice(0, PREVIEW_LIMIT);
  const hiddenCount = selectedEntries.length - preview.length;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.danger}
      paddingX={1}
      flexDirection="column"
      marginTop={1}
    >
      <Text bold color={theme.danger}>
        ⚠ Delete {selectedEntries.length} item(s), {fmtSize(totalBytes)}? This cannot be undone.
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {preview.map((entry) => (
          <Text key={entry.path} dimColor>
            {'  • '}
            {entry.ruleName}
            {entry.project ? ` (${basename(entry.project)})` : ''} — {fmtSize(entry.size)}
          </Text>
        ))}
        {hiddenCount > 0 && <Text dimColor>{`  ...and ${hiddenCount} more`}</Text>}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[y] confirm · [n / esc] cancel</Text>
      </Box>
    </Box>
  );
}
