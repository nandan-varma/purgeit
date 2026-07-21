import { Box, Text } from 'ink';
import { fmtSize, sortLabel } from '../format.js';
import type { AppState } from '../state.js';
import { theme } from '../theme.js';
import { useSpinner } from '../useSpinner.js';

export function Header({ root, state }: { root: string; state: AppState }) {
  const spinner = useSpinner(state.phase === 'scanning');
  const total = state.entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const selectedBytes = [...state.selected].reduce((sum, path) => {
    const e = state.entries.find((x) => x.path === path);
    return sum + (e?.size ?? 0);
  }, 0);

  return (
    <Box borderStyle="round" borderColor={theme.accent} paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={theme.accent} wrap="truncate-end">
          purgeit{state.phase === 'scanning' ? ` ${spinner} scanning…` : ''}
        </Text>
        <Text dimColor wrap="truncate-end">
          {sortLabel(state.sortKey, state.sortDir)}
        </Text>
      </Box>
      <Box justifyContent="space-between">
        <Text dimColor wrap="truncate-middle">
          {root}
        </Text>
        <Text wrap="truncate-end">
          {state.entries.length} item(s) · {fmtSize(total)}
        </Text>
      </Box>
      {/* Always rendered (never conditionally omitted) so the header's line
          count — and everything Ink has to erase/redraw beneath it — stays
          constant across the 0-selected <-> N-selected transition, instead
          of the whole app visibly shifting down/up by a row each time. Every
          Text here also has an explicit wrap="truncate-*" for the same
          reason: an un-truncated Text can silently word-wrap onto a second
          line at a narrow width, which is exactly the kind of line-count
          instability that leaves stale rows behind across a resize (Ink's
          redraw erases based on the *previous* render's line count). */}
      <Box justifyContent="flex-end">
        <Text color={theme.selectedBg} bold wrap="truncate-end">
          {state.selected.size > 0
            ? `${state.selected.size} selected · ${fmtSize(selectedBytes)}`
            : ' '}
        </Text>
      </Box>
    </Box>
  );
}
