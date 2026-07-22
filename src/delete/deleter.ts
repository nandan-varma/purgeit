import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parse, resolve } from 'node:path';
import pLimit from 'p-limit';

export interface DeleteOptions {
  readonly signal?: AbortSignal | undefined;
  /** Simulate deletion without touching the filesystem. */
  readonly dryRun?: boolean;
  /** Max concurrent deletion operations. Default 8. */
  readonly concurrency?: number;
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

  async function deleteOne(path: string): Promise<DeletionResult> {
    if (isDangerousPath(path)) {
      return {
        path,
        error: new Error('refusing to delete filesystem root or home directory'),
      };
    }
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
