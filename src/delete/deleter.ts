import { realpath, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, parse, relative, resolve } from 'node:path';
import pLimit from 'p-limit';
import { formatDuration } from '../format.js';
import { checkActivity } from '../scan/activity.js';
import { appendHistory, type HistoryRecord, historyEnabled } from './history.js';

/**
 * Default recency window for unattended (headless / plan) deletions, matching
 * Mole's purge: anything touched in the last week is presumed in use.
 */
export const DEFAULT_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DeleteOptions {
  readonly signal?: AbortSignal | undefined;
  /** Simulate deletion without touching the filesystem. */
  readonly dryRun?: boolean;
  /** Max concurrent deletion operations. Default 8. */
  readonly concurrency?: number;
  /**
   * Scan roots every path must physically resolve inside (symlinks followed on
   * both sides). A path whose ancestor was swapped for a symlink after the scan
   * resolves elsewhere and is refused. Omit to skip the check.
   */
  readonly roots?: readonly string[] | undefined;
  /**
   * Refuse any path with an entry modified within this many milliseconds
   * (see checkActivity) — or whose activity can't be determined. Omit or 0 to
   * skip the check.
   */
  readonly idleForMs?: number | undefined;
  /**
   * Append each real (non-dry-run) outcome to the deletion history (see
   * history.ts). Off by default for library callers; the CLI turns it on.
   */
  readonly recordHistory?: boolean | undefined;
}

export type DeleteEvent =
  | { readonly type: 'deleting'; readonly path: string }
  | { readonly type: 'deleted'; readonly path: string; readonly dryRun: boolean }
  | { readonly type: 'error'; readonly path: string; readonly message: string }
  | { readonly type: 'done'; readonly deleted: number; readonly failed: number };

/**
 * Refuses to delete a small set of catastrophically-broad paths (filesystem
 * root, the user's home directory) that should never be reachable through
 * the rule engine's own matching, but are cheap enough to guard against
 * directly here as a last line of defense before an `rm -rf`.
 */
function isDangerousPath(path: string): boolean {
  const resolved = resolve(path);
  // On Unix, resolved === '/' matches root. On Windows, 'C:\' has root 'C:\'
  // so parse(resolved).root === resolved catches drive roots too.
  return parse(resolved).root === resolved || resolved === resolve(homedir());
}

type DeletionResult =
  | { readonly path: string; readonly dryRun: boolean }
  | { readonly path: string; readonly error: Error };

/**
 * Deletes each path in bounded parallel chunks, yielding progress events as it
 * goes. Continues past individual failures (aggregated into the final `done`
 * count) rather than aborting the whole batch over one bad path.
 */
export async function* deleteEntries(
  paths: readonly string[],
  opts: DeleteOptions = {},
): AsyncGenerator<DeleteEvent> {
  let deleted = 0;
  let failed = 0;

  if (opts.signal?.aborted) {
    yield { type: 'done', deleted, failed };
    return;
  }

  const concurrency = opts.concurrency ?? 8;
  const realRoots =
    opts.roots === undefined ? undefined : Promise.all(opts.roots.map((root) => realpath(root)));

  async function guard(path: string): Promise<string | undefined> {
    if (isDangerousPath(path)) return 'refusing to delete filesystem root or home directory';
    if (realRoots !== undefined) {
      const real = await realpath(path).catch(() => undefined);
      const inside = (root: string) => {
        const rel = relative(root, real as string);
        return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
      };
      if (real === undefined || !(await realRoots).some(inside)) {
        return 'refusing to delete a path that resolves outside the scanned roots';
      }
    }
    if (opts.idleForMs !== undefined && opts.idleForMs > 0) {
      const activity = await checkActivity(path, opts.idleForMs);
      if (activity !== 'idle') {
        return `skipped: ${activity === 'recent' ? 'modified' : 'could not check for changes'} within the last ${formatDuration(opts.idleForMs)} (lower the window with --min-age, 0 to disable)`;
      }
    }
    return undefined;
  }

  async function deleteOne(path: string): Promise<DeletionResult> {
    const refusal = await guard(path);
    if (refusal !== undefined) return { path, error: new Error(refusal) };
    if (opts.dryRun) {
      return { path, dryRun: true };
    }
    try {
      await rm(path, { recursive: true, force: true });
      return { path, dryRun: false };
    } catch (err) {
      return { path, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // Process in chunks so the event stream stays deterministic: every 'deleting'
  // for the current chunk is emitted before any 'deleted'/'error' for that chunk.
  const limit = pLimit(concurrency);
  for (let i = 0; i < paths.length; i += concurrency) {
    if (opts.signal?.aborted) break;
    const chunk = paths.slice(i, i + concurrency);
    for (const path of chunk) {
      yield { type: 'deleting', path };
    }
    const results = await Promise.all(chunk.map((path) => limit(() => deleteOne(path))));
    if (opts.recordHistory && !opts.dryRun && historyEnabled()) {
      const time = new Date().toISOString();
      await appendHistory(
        results.map(
          (result): HistoryRecord =>
            'error' in result
              ? {
                  schemaVersion: 1,
                  time,
                  action: 'failed',
                  path: result.path,
                  message: result.error.message,
                }
              : { schemaVersion: 1, time, action: 'deleted', path: result.path },
        ),
      );
    }
    for (const result of results) {
      if ('error' in result) {
        failed++;
        yield { type: 'error', path: result.path, message: result.error.message };
      } else {
        deleted++;
        yield { type: 'deleted', path: result.path, dryRun: result.dryRun };
      }
    }
  }

  yield { type: 'done', deleted, failed };
}
