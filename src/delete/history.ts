import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** One line of the deletion history (JSON Lines). */
export interface HistoryRecord {
  readonly schemaVersion: 1;
  /** ISO 8601 time the outcome was recorded. */
  readonly time: string;
  readonly action: 'deleted' | 'failed';
  readonly path: string;
  /** Why a deletion failed or was refused (only for `failed`). */
  readonly message?: string | undefined;
}

/**
 * Where the history lives: `PURGEIT_HISTORY_FILE` if set, else the platform's
 * log/state directory — `~/Library/Logs/purgeit` on macOS (next to Mole's
 * operations log), `%LOCALAPPDATA%\purgeit` on Windows, and
 * `$XDG_STATE_HOME/purgeit` (default `~/.local/state/purgeit`) elsewhere.
 */
export function historyFile(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): string {
  if (env.PURGEIT_HISTORY_FILE) return env.PURGEIT_HISTORY_FILE;
  const home = homedir();
  if (platform === 'darwin') return join(home, 'Library', 'Logs', 'purgeit', 'history.jsonl');
  if (platform === 'win32') {
    return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'purgeit', 'history.jsonl');
  }
  return join(env.XDG_STATE_HOME ?? join(home, '.local', 'state'), 'purgeit', 'history.jsonl');
}

/** True unless `PURGEIT_NO_HISTORY` is set to a non-empty value. */
export function historyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.PURGEIT_NO_HISTORY;
}

/**
 * Appends records to the history. Never throws: an unwritable history must
 * not turn a successful deletion into a failure, so errors are swallowed.
 */
export async function appendHistory(
  records: readonly HistoryRecord[],
  file = historyFile(),
): Promise<void> {
  if (records.length === 0) return;
  try {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, records.map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8');
  } catch {
    // History is best-effort by design.
  }
}

/** Reads the history newest first, skipping malformed lines; an absent file is an empty history. */
export async function readHistory(file = historyFile()): Promise<HistoryRecord[]> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const records: HistoryRecord[] = [];
  for (const line of raw.split('\n')) {
    try {
      const value = JSON.parse(line) as Partial<HistoryRecord>;
      if (value.schemaVersion === 1 && typeof value.path === 'string')
        records.push(value as HistoryRecord);
    } catch {
      // Skip blank or partially written lines.
    }
  }
  return records.reverse();
}
