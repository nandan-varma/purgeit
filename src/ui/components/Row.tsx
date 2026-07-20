import { Text } from 'ink';
import React from 'react';
import type { ScanEntry } from '../../scan/scanner.js';
import { fmtSize } from '../format.js';

export function Row({
  entry,
  cursor,
  index,
  selected,
}: {
  entry: ScanEntry;
  cursor: number;
  index: number;
  selected: boolean;
}) {
  const isCursor = index === cursor;
  const checkbox = selected ? <Text>[x]</Text> : <Text dimColor>[ ]</Text>;
  const kindBadge = entry.kind === 'gated' ? <Text color="yellow"> gated</Text> : null;

  return (
    <Text>
      {isCursor ? <Text inverse>{'>'}</Text> : ' '}
      {checkbox} <Text bold>{fmtSize(entry.size)}</Text> {entry.ruleName}
      {kindBadge}{' '}
      <Text dimColor>
        {entry.project ? `(${entry.project}) ` : ''}
        {entry.path}
      </Text>
    </Text>
  );
}
