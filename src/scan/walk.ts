import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createGateContext } from '../rules/gate-context.js';
import type { ResolvedRuleSet } from '../types.js';

export interface WalkMatch {
  readonly path: string;
  readonly kind: 'always-safe' | 'gated';
  readonly ruleName: string;
}

export interface WalkOptions {
  readonly signal?: AbortSignal | undefined;
  /** Never descend more than this many levels below `root`. Default: unlimited. */
  readonly maxDepth?: number | undefined;
}

interface StackEntry {
  readonly path: string;
  readonly depth: number;
}

/**
 * Recursively walks `root` looking for artifact directories, applying the
 * same pruning semantics as CLEANUP.sh's two-pass `find ... -prune` design
 * in a single pass: VCS metadata is never descended into; once a directory
 * matches an always-safe or gated name it is reported (gated names only if
 * their gate predicate passes) and never descended into either way — so a
 * native module's own nested `build/`/`bin/` inside `node_modules` can never
 * be reached, because `node_modules` itself already stopped the walk.
 * Symlinked directories are never followed, to avoid cycles.
 */
export async function* walk(
  root: string,
  ruleSet: ResolvedRuleSet,
  opts: WalkOptions = {},
): AsyncGenerator<WalkMatch> {
  const stack: StackEntry[] = [{ path: root, depth: 0 }];

  while (stack.length > 0) {
    if (opts.signal?.aborted) return;

    // biome-ignore lint/style/noNonNullAssertion: stack.length > 0 was just checked
    const { path: dir, depth } = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Permission denied, or the directory vanished mid-scan — skip it
      // rather than aborting the whole scan over one unreadable subtree.
      continue;
    }

    for (const entry of entries) {
      if (opts.signal?.aborted) return;
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

      const name = entry.name;
      if (ruleSet.pruneMeta.has(name)) continue;

      const path = join(dir, name);

      if (ruleSet.alwaysSafe.has(name)) {
        yield { path, kind: 'always-safe', ruleName: name };
        continue;
      }

      const gate = ruleSet.gated.get(name);
      if (gate !== undefined) {
        if (gate(createGateContext(path))) {
          yield { path, kind: 'gated', ruleName: name };
        }
        continue;
      }

      if (opts.maxDepth !== undefined && depth >= opts.maxDepth) continue;
      stack.push({ path, depth: depth + 1 });
    }
  }
}
