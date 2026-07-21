import { Box, Text } from 'ink';
import { fmtSize, sortLabel } from '../format.js';
import type { AppState } from '../state.js';
import { theme } from '../theme.js';

export function Header({ root, state }: { root: string; state: AppState }) {
  const total = state.entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const selectedBytes = [...state.selected].reduce((sum, path) => {
    const e = state.entries.find((x) => x.path === path);
    return sum + (e?.size ?? 0);
  }, 0);

  return (
    <Box borderStyle="round" borderColor={theme.accent} paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={theme.accent}>
          purgeit{state.phase === 'scanning' ? ' ⠋ scanning…' : ''}
        </Text>
        <Text dimColor>{sortLabel(state.sortKey, state.sortDir)}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Text dimColor wrap="truncate-middle">
          {root}
        </Text>
        <Text>
          {state.entries.length} item(s) · {fmtSize(total)}
        </Text>
      </Box>
      {state.selected.size > 0 && (
        <Box justifyContent="flex-end">
          <Text color={theme.selectedBg} bold>
            {state.selected.size} selected · {fmtSize(selectedBytes)}
          </Text>
        </Box>
      )}
    </Box>
  );
}
