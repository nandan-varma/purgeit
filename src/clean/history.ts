import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import envPaths from 'env-paths';
import { z } from 'zod';

import { errorCode } from '../errors.js';

const HistoryRecordSchema = z.object({
  time: z.iso.datetime(),
  action: z.enum(['deleted', 'failed']),
  path: z.string(),
  bytes: z.number().optional(),
  message: z.string().optional(),
});

/** One line of the deletion history (JSON Lines). */
export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;

/** `~/Library/Logs/purgeit/history.jsonl` on macOS, the platform's log directory elsewhere. */
export function defaultHistoryFile(): string {
  return join(envPaths('purgeit', { suffix: '' }).log, 'history.jsonl');
}

export async function appendHistory(
  file: string,
  records: readonly HistoryRecord[],
): Promise<void> {
  if (records.length === 0) return;
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, records.map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8');
}

/**
 * Reads the history newest first. A missing file is an empty history; a line
 * that does not parse (an append cut short by a crash) is skipped.
 */
export async function readHistory(file: string): Promise<HistoryRecord[]> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return [];
    throw error;
  }
  const records: HistoryRecord[] = [];
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    try {
      const parsed = HistoryRecordSchema.safeParse(JSON.parse(line));
      if (parsed.success) records.push(parsed.data);
    } catch {
      // torn line
    }
  }
  return records.toReversed();
}
