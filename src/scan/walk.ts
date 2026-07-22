import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pLimit, { type LimitFunction } from 'p-limit';
import { createGateContext } from '../rules/gate-context.js';
import type { ResolvedRuleSet } from '../types.js';
import { AsyncQueue } from './async-queue.js';

export interface WalkMatch {
  readonly path: string;
  readonly kind: 'always-safe' | 'gated';
  readonly ruleName: string;
}

export interface WalkOptions {
  readonly signal?: AbortSignal | undefined;
  /** Never descend more than this many levels below `root`. Default: unlimited. */
  readonly maxDepth?: number | undefined;
  /** Max concurrent `readdir` calls in flight. Default 8. Ignored if `limit` is provided. */
  readonly concurrency?: number | undefined;
  /**
   * Share an existing p-limit instance (e.g. one also bounding size
   * computations) instead of creating a fresh one scoped to this call.
   */
  readonly limit?: LimitFunction | undefined;
}

/**
 * Concurrently walks `root` looking for artifact directories, applying the
 * same pruning semantics as CLEANUP.sh's two-pass `find ... -prune` design
 * in a single pass: VCS metadata is never descended into; once a directory
 * matches an always-safe or gated name it is reported (gated names only if
 * their gate predicate passes) and never descended into either way — so a
 * native module's own nested `build/`/`bin/` inside `node_modules` can never
 * be reached, because `node_modules` itself already stopped the walk.
 * Symlinked directories are never followed.
 *
 * Sibling directories are read concurrently (bounded by `concurrency`/
 * `limit`) rather than one at a time, so a wide tree of many projects (or
 * many packages in a monorepo) doesn't pay for discovery serially — only
 * sizing was previously parallelized.
 */
export async function* walk(
  root: string,
  ruleSet: ResolvedRuleSet,
  opts: WalkOptions = {},
): AsyncGenerator<WalkMatch> {
  const limit = opts.limit ?? pLimit(opts.concurrency ?? 8);
  const queue = new AsyncQueue<WalkMatch>();
  let pending = 0;

  function maybeFinish(): void {
    if (pending === 0) queue.close();
  }

  function scheduleDir(dir: string, depth: number): void {
    pending++;
    void limit(async () => {
      if (opts.signal?.aborted) {
        pending--;
        maybeFinish();
        return;
      }

      let entries: import('node:fs').Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        // Permission denied, or the directory vanished mid-scan — skip it
        // rather than aborting the whole scan over one unreadable subtree.
        pending--;
        maybeFinish();
        return;
      }

      for (const entry of entries) {
        if (opts.signal?.aborted) break;
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

        const name = entry.name;
        if (ruleSet.pruneMeta.has(name)) continue;

        const path = join(dir, name);

        if (ruleSet.alwaysSafe.has(name)) {
          queue.push({ path, kind: 'always-safe', ruleName: name });
          continue;
        }

        const gate = ruleSet.gated.get(name);
        if (gate !== undefined) {
          if (gate(createGateContext(path))) {
            queue.push({ path, kind: 'gated', ruleName: name });
          }
          continue;
        }

        if (opts.maxDepth !== undefined && depth >= opts.maxDepth) continue;
        scheduleDir(path, depth + 1);
      }

      pending--;
      maybeFinish();
    });
  }

  scheduleDir(root, 0);
  yield* queue;
}
