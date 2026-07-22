import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { defaultRuleSet } from '../rules/merge.js';
import type { WalkOptions } from './walk.js';
import { walk } from './walk.js';

async function collect(root: string, ruleSet = defaultRuleSet(), opts?: WalkOptions) {
  const matches = [];
  for await (const match of walk(root, ruleSet, opts)) {
    matches.push(match);
  }
  return matches;
}

describe('walk', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('finds an always-safe directory and does not descend into it', async () => {
    root = buildTree({
      'package.json': '{}',
      node_modules: { '.bin': null, react: { 'package.json': '{}' } },
    });
    const matches = await collect(root);
    expect(matches).toEqual([
      { path: join(root, 'node_modules'), kind: 'always-safe', ruleName: 'node_modules' },
    ]);
  });

  it('never descends into .git', async () => {
    root = buildTree({
      '.git': { objects: { dist: null } }, // a decoy 'dist' inside .git must never surface
    });
    const matches = await collect(root);
    expect(matches).toEqual([]);
  });

  it('finds nested artifacts in a monorepo (recurses into ordinary directories)', async () => {
    root = buildTree({
      'package.json': '{}',
      packages: {
        a: { 'package.json': '{}', node_modules: null, dist: null },
        b: { 'package.json': '{}', node_modules: null },
      },
    });
    const matches = await collect(root);
    const paths = matches.map((m) => m.path).sort();
    expect(paths).toEqual(
      [
        join(root, 'packages', 'a', 'node_modules'),
        join(root, 'packages', 'a', 'dist'),
        join(root, 'packages', 'b', 'node_modules'),
      ].sort(),
    );
  });

  it('respects maxDepth, not descending past the configured level', async () => {
    root = buildTree({
      packages: { a: { node_modules: null } }, // node_modules is at depth 2 (packages=1, a=2)
    });
    const shallow = await collect(root, defaultRuleSet(), { maxDepth: 1 });
    expect(shallow).toEqual([]);

    const deepEnough = await collect(root, defaultRuleSet(), { maxDepth: 2 });
    expect(deepEnough).toEqual([
      {
        path: join(root, 'packages', 'a', 'node_modules'),
        kind: 'always-safe',
        ruleName: 'node_modules',
      },
    ]);
  });

  it('evaluates gated names and only reports them when the gate passes', async () => {
    root = buildTree({
      Podfile: 'platform :ios\n',
      Pods: null,
      other: { build: null }, // no manifest sibling -> gate fails, not reported
    });
    const matches = await collect(root);
    expect(matches).toEqual([{ path: join(root, 'Pods'), kind: 'gated', ruleName: 'Pods' }]);
  });

  it('does not wander into node_modules internals when scanning for gated candidates', async () => {
    // A native module ships its own `build/` and `Podfile`-adjacent dirs — since
    // node_modules itself is always-safe and stops the walk, none of that must
    // ever surface as a separate gated match.
    root = buildTree({
      'package.json': '{}',
      node_modules: {
        'native-thing': { 'package.json': '{}', Podfile: 'platform :ios\n', build: null },
      },
    });
    const matches = await collect(root);
    expect(matches).toEqual([
      { path: join(root, 'node_modules'), kind: 'always-safe', ruleName: 'node_modules' },
    ]);
  });

  it('does not follow symlinked directories (avoids cycles)', async () => {
    root = buildTree({ real: { node_modules: null } });
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const matches = await collect(root);
    expect(matches).toEqual([
      { path: join(root, 'real', 'node_modules'), kind: 'always-safe', ruleName: 'node_modules' },
    ]);
  });

  it('skips unreadable directories instead of throwing', async () => {
    root = buildTree({ ok: { node_modules: null } });
    const matches = await collect(join(root, 'does-not-exist'));
    expect(matches).toEqual([]);
  });

  it('stops immediately when the signal is already aborted', async () => {
    root = buildTree({ node_modules: null });
    const controller = new AbortController();
    controller.abort();
    const matches = await collect(root, defaultRuleSet(), { signal: controller.signal });
    expect(matches).toEqual([]);
  });

  it('stops scheduling new directory reads once the signal aborts', async () => {
    // Sibling directories are read concurrently, so with concurrency: 1 only
    // the first is ever started — the second is still queued, provably not
    // yet in flight, when abort() fires (same determinism trick as
    // scanner.test.ts's abort tests).
    root = buildTree({ a: { node_modules: null }, b: { node_modules: null } });
    const controller = new AbortController();
    const matches = [];
    for await (const match of walk(root, defaultRuleSet(), {
      signal: controller.signal,
      concurrency: 1,
    })) {
      matches.push(match);
      controller.abort();
    }
    expect(matches.length).toBe(1);
  });

  it('delivers all matches from an already-scheduled directory even if abort fires mid-loop', async () => {
    // `dist` and `node_modules` are both entries of the same already-read
    // directory (root itself) — that directory's entries are processed
    // synchronously once its readdir resolves (no yield point between
    // them), so aborting right after the first match doesn't stop the
    // second from being queued too. Abort only prevents *new* directory
    // reads from being scheduled, not the remainder of one already in flight.
    root = buildTree({ dist: null, node_modules: null });
    const controller = new AbortController();
    const matches = [];
    for await (const match of walk(root, defaultRuleSet(), { signal: controller.signal })) {
      matches.push(match);
      controller.abort();
    }
    expect(matches.length).toBe(2);
  });
});
