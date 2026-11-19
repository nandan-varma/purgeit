import { realpath, rm } from 'node:fs/promises';
import pLimit from 'p-limit';
import { createIo, type Io } from '../fs/io.js';
import type { RuleSet } from '../rules/rule-set.js';
import { stream } from '../stream.js';
import { type Candidate, inspect, type Refusal } from './guard.js';
import { appendHistory, type HistoryRecord } from './history.js';

export interface Target extends Candidate {
  /** Size from the scan, used only to report how much was freed. */
  readonly bytes?: number;
}

export interface CleanOptions {
  readonly rules: RuleSet;
  /** Every target must resolve strictly inside one of these. */
  readonly roots: readonly string[];
  /** Refuse anything modified within this many ms. Default 0 (off). */
  readonly idleFor?: number;
  /** Run every check, delete nothing. */
  readonly dryRun?: boolean;
  /** Deletions in flight. Default 4. */
  readonly concurrency?: number;
  /** Append every outcome to this JSON Lines file. Never written on dry runs. */
  readonly historyFile?: string;
  readonly signal?: AbortSignal;
  readonly io?: Io;
  readonly now?: number;
}

export interface CleanSummary {
  readonly deleted: number;
  readonly refused: number;
  readonly failed: number;
  /** Bytes freed (or, on a dry run, that would be). */
  readonly bytes: number;
  readonly dryRun: boolean;
}

export type CleanEvent =
  | { readonly type: 'start'; readonly path: string }
  | {
      readonly type: 'deleted';
      readonly path: string;
      readonly bytes: number;
      readonly dryRun: boolean;
    }
  | { readonly type: 'refused'; readonly path: string; readonly refusal: Refusal }
  | { readonly type: 'failed'; readonly path: string; readonly message: string }
  | { readonly type: 'warning'; readonly message: string }
  | { readonly type: 'done'; readonly summary: CleanSummary };

/**
 * Deletes `targets`, re-verifying each one first (see `inspect`). One refused
 * or failed path never stops the rest. Events stream as work completes.
 */
export async function* clean(
  targets: readonly Target[],
  options: CleanOptions,
): AsyncGenerator<CleanEvent, void, undefined> {
  yield* stream<CleanEvent>(async (emit, signal) => {
    const io = options.io ?? createIo();
    const dryRun = options.dryRun ?? false;
    const now = options.now ?? Date.now();
    const limit = pLimit(options.concurrency ?? 4);
    const realRoots = (
      await Promise.all(options.roots.map((root) => realpath(root).catch(() => undefined)))
    ).filter((root): root is string => root !== undefined);

    const totals = { deleted: 0, refused: 0, failed: 0, bytes: 0 };
    let historyWarned = false;

    const record = async (entry: Omit<HistoryRecord, 'time'>): Promise<void> => {
      if (options.historyFile === undefined || dryRun) return;
      try {
        await appendHistory(options.historyFile, [{ time: new Date().toISOString(), ...entry }]);
      } catch (error) {
        if (!historyWarned) {
          historyWarned = true;
          emit({
            type: 'warning',
            message: `could not write history: ${(error as Error).message}`,
          });
        }
      }
    };

    await Promise.all(
      targets.map((target) =>
        limit(async () => {
          if (signal.aborted) return;
          emit({ type: 'start', path: target.path });
          const refusal = await inspect(target, {
            rules: options.rules,
            io,
            realRoots,
            idleFor: options.idleFor ?? 0,
            now,
          });
          if (refusal !== undefined) {
            totals.refused++;
            emit({ type: 'refused', path: target.path, refusal });
            return;
          }
          const bytes = target.bytes ?? 0;
          try {
            if (!dryRun) await rm(target.path, { recursive: true, maxRetries: 2 });
          } catch (error) {
            const message = (error as Error).message;
            totals.failed++;
            emit({ type: 'failed', path: target.path, message });
            await record({ action: 'failed', path: target.path, message });
            return;
          }
          totals.deleted++;
          totals.bytes += bytes;
          emit({ type: 'deleted', path: target.path, bytes, dryRun });
          await record({ action: 'deleted', path: target.path, bytes });
        }),
      ),
    );

    emit({ type: 'done', summary: { ...totals, dryRun } });
  }, options.signal);
}
