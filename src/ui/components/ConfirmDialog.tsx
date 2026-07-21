import { Box, Text } from 'ink';
import { fmtSize } from '../format.js';
import type { AppState } from '../state.js';
import { theme } from '../theme.js';

export function ConfirmDialog({ state }: { state: AppState }) {
  const selectedEntries = state.entries.filter((e) => state.selected.has(e.path));
  const totalBytes = selectedEntries.reduce((sum, e) => sum + (e.size ?? 0), 0);

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
      <Text dimColor>[y] confirm · [n / esc] cancel</Text>
    </Box>
  );
}
