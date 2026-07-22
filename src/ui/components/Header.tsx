import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { fmtSize, sortLabel } from '../format.js';
import type { AppState } from '../state.js';
import { theme } from '../theme.js';
import { useSpinner } from '../useSpinner.js';

export function Header({
  root,
  state,
  dryRun,
}: {
  root: string;
  state: AppState;
  dryRun: boolean;
}) {
  const spinner = useSpinner(state.phase === 'scanning');
  const total = state.entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const entriesByPath = useMemo(
    () => new Map(state.entries.map((e) => [e.path, e])),
    [state.entries],
  );
  const selectedBytes = useMemo(
    () => [...state.selected].reduce((sum, path) => sum + (entriesByPath.get(path)?.size ?? 0), 0),
    [state.selected, entriesByPath],
  );

  return (
    // flexShrink={0}: the app root clamps total height to the terminal
    // (see App.tsx) via overflow="hidden", and Yoga's default is to shrink
    // children to fit before falling back to clipping whatever's left over.
    // A bordered Box that gets shrunk instead of clipped doesn't shrink
    // "gracefully" — its top/bottom border rows get squashed together with
    // content into a garbled single line. Refusing to shrink means this
    // renders fully or (on an extremely short terminal) gets cleanly
    // omitted entirely by the outer clip — never half-mangled.
    <Box
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      flexDirection="column"
      flexShrink={0}
    >
      <Box justifyContent="space-between">
        <Text bold color={theme.accent} wrap="truncate-end">
          purgeit
          {dryRun ? ' [dry-run]' : ''}
          {state.phase === 'scanning' ? ` ${spinner} scanning…` : ''}
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
