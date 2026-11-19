import { readHistory } from '../../clean/history.js';
import { formatSize } from '../../units.js';
import type { CliEnv } from '../env.js';
import { tildify } from '../render.js';

export interface HistoryFlags {
  limit: number;
  format: 'text' | 'json';
}

/** Shows what purgeit has deleted, newest first. */
export async function runHistory(flags: HistoryFlags, env: CliEnv): Promise<number> {
  if (env.historyFile === undefined) {
    env.out('History is disabled.');
    return 0;
  }
  const records = (await readHistory(env.historyFile)).slice(0, flags.limit);
  if (flags.format === 'json') {
    env.out(JSON.stringify(records, null, 2));
    return 0;
  }
  if (records.length === 0) {
    env.out('No deletions recorded yet.');
    return 0;
  }
  for (const record of records) {
    const size =
      record.bytes === undefined ? ''.padStart(10) : formatSize(record.bytes).padStart(10);
    const note = record.message === undefined ? '' : ` — ${record.message}`;
    env.out(
      `${record.time}  ${record.action.padEnd(7)} ${size}  ${tildify(record.path, env.home)}${note}`,
    );
  }
  return 0;
}
