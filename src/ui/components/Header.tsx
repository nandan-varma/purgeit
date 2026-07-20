import { Text } from 'ink';
import React from 'react';
import { fmtSize, sortLabel } from '../format.js';
import type { AppState } from '../state.js';

export function Header({ root, state }: { root: string; state: AppState }) {
  const total = state.entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const selected = [...state.selected].reduce((sum, path) => {
    const e = state.entries.find((x) => x.path === path);
    return sum + (e?.size ?? 0);
  }, 0);

  const spinner = state.phase === 'scanning' ? ' ◌' : '';

  return (
    <Text>
      <Text bold>purgeit</Text>
      {spinner} <Text dimColor>{root}</Text> {state.entries.length} item(s), {fmtSize(total)}
      {state.selected.size > 0 && (
        <Text>
          {' '}
          ({state.selected.size} selected, {fmtSize(selected)})
        </Text>
      )}{' '}
      <Text dimColor>{sortLabel(state.sortKey, state.sortDir)}</Text>
    </Text>
  );
}
