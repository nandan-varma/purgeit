import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';

export interface DeleteOptions {
  readonly signal?: AbortSignal | undefined;
  /** Simulate deletion without touching the filesystem. */
  readonly dryRun?: boolean;
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
  return resolved === sep || resolved === resolve(homedir());
}

/**
 * Deletes each path in order, yielding progress events as it goes. Continues
 * past individual failures (aggregated into the final `done` count) rather
 * than aborting the whole batch over one bad path.
 */
export async function* deleteEntries(
  paths: readonly string[],
  opts: DeleteOptions = {},
): AsyncGenerator<DeleteEvent> {
  let deleted = 0;
  let failed = 0;

  for (const path of paths) {
    if (opts.signal?.aborted) break;
    yield { type: 'deleting', path };

    if (isDangerousPath(path)) {
      failed++;
      yield {
        type: 'error',
        path,
        message: 'refusing to delete filesystem root or home directory',
      };
      continue;
    }

    if (opts.dryRun) {
      deleted++;
      yield { type: 'deleted', path, dryRun: true };
      continue;
    }

    try {
      await rm(path, { recursive: true, force: true });
      deleted++;
      yield { type: 'deleted', path, dryRun: false };
    } catch (err) {
      failed++;
      yield { type: 'error', path, message: (err as Error).message };
    }
  }

  yield { type: 'done', deleted, failed };
}
