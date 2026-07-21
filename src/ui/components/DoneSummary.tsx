import { Text } from 'ink';
import { fmtSize } from '../format.js';
import type { AppState } from '../state.js';

export function DoneSummary({ state }: { state: AppState }) {
  if (state.entries.length === 0 && state.scanDone) {
    return <Text>Nothing to clean.</Text>;
  }

  if (state.deletion) {
    const totalBytes = state.entries
      .filter((e) => state.selected.has(e.path))
      .reduce((sum, e) => sum + (e.size ?? 0), 0);
    return (
      <Text>
        <Text color="green">Done:</Text> {state.deletion.deleted} deleted, {state.deletion.failed}{' '}
        failed
        {state.deletion.deleted > 0 && ` (${fmtSize(totalBytes)} freed)`}
      </Text>
    );
  }

  return <Text>Quit.</Text>;
}
