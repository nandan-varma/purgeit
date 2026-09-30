import { historyFile, readHistory } from '../delete/history.js';

export interface HistoryIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export const HISTORY_USAGE = `Usage: purgeit history [--json] [--limit <n>]

Shows what purgeit deleted (or failed to delete), newest first. Every real
deletion from scan/tui/apply is recorded; dry runs are not.

  --json         Print the records as a JSON array
  --limit <n>    Show at most n records (default 50)

Records live in ${historyFile()} (set PURGEIT_HISTORY_FILE to move it,
PURGEIT_NO_HISTORY=1 to stop recording).`;

const DEFAULT_LIMIT = 50;

/** Implements `purgeit history`. */
export async function runHistoryCommand(argv: string[], io: HistoryIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));

  if (argv.includes('--help') || argv.includes('-h')) {
    stdout(HISTORY_USAGE);
    return 0;
  }
  let limit = DEFAULT_LIMIT;
  const limitIndex = argv.indexOf('--limit');
  if (limitIndex !== -1) {
    limit = Number(argv[limitIndex + 1]);
    if (!Number.isInteger(limit) || limit < 1) {
      stderr(`purgeit: invalid --limit '${argv[limitIndex + 1] ?? ''}' (expected an integer >= 1)`);
      return 2;
    }
  }
  const unknown = argv.filter(
    (arg, i) => arg !== '--json' && arg !== '--limit' && argv[i - 1] !== '--limit',
  );
  if (unknown.length > 0) {
    stderr(`purgeit: unexpected history argument '${unknown[0]}'`);
    stderr(`\n${HISTORY_USAGE}`);
    return 2;
  }

  const records = (await readHistory()).slice(0, limit);
  if (argv.includes('--json')) {
    stdout(JSON.stringify(records, null, 2));
  } else if (records.length === 0) {
    stdout('No deletions recorded yet.');
  } else {
    for (const record of records) {
      const outcome =
        record.action === 'deleted' ? 'deleted' : `failed (${record.message ?? 'unknown error'})`;
      stdout(`${record.time}  ${outcome}  ${record.path}`);
    }
  }
  return 0;
}
