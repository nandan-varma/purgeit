import { Text } from 'ink';
import React from 'react';
import type { AppState } from '../state.js';
import { Row } from './Row.js';

export function ArtifactList({ state }: { state: AppState }) {
  const visible = state.entries.slice(0, 30);

  return (
    <>
      {visible.map((entry, i) => (
        <Row
          key={entry.path}
          entry={entry}
          cursor={state.cursor}
          index={i}
          selected={state.selected.has(entry.path)}
        />
      ))}
      {state.entries.length > 30 && <Text dimColor>... {state.entries.length - 30} more</Text>}
    </>
  );
}
