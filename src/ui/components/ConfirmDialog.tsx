import { Text } from 'ink';
import React from 'react';
import { fmtSize } from '../format.js';
import type { AppState } from '../state.js';

export function ConfirmDialog({ state }: { state: AppState }) {
  const selectedEntries = state.entries.filter((e) => state.selected.has(e.path));
  const totalBytes = selectedEntries.reduce((sum, e) => sum + (e.size ?? 0), 0);

  return (
    <Text>
      <Text color="yellow">
        Delete {selectedEntries.length} item(s), {fmtSize(totalBytes)}? [y/N]
      </Text>
    </Text>
  );
}
