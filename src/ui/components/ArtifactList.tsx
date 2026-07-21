import { Text } from 'ink';
import React from 'react';
import type { AppState } from '../state.js';
import { sortedEntries } from '../state.js';
import { Row } from './Row.js';

const VISIBLE_ROWS = 30;

export function ArtifactList({ state }: { state: AppState }) {
  const entries = sortedEntries(state);

  // Center the viewport on the cursor so moving past row 30 keeps the
  // highlighted row visible instead of scrolling off-screen.
  const maxStart = Math.max(0, entries.length - VISIBLE_ROWS);
  const start = Math.max(0, Math.min(state.cursor - Math.floor(VISIBLE_ROWS / 2), maxStart));
  const visible = entries.slice(start, start + VISIBLE_ROWS);
  const hiddenAfter = entries.length - start - visible.length;

  return (
    <>
      {start > 0 && <Text dimColor>... {start} above</Text>}
      {visible.map((entry, i) => (
        <Row
          key={entry.path}
          entry={entry}
          cursor={state.cursor}
          index={start + i}
          selected={state.selected.has(entry.path)}
        />
      ))}
      {hiddenAfter > 0 && <Text dimColor>... {hiddenAfter} more</Text>}
    </>
  );
}
