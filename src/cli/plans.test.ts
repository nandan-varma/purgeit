import { existsSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backdate, buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { applyPlan, writePlan } from './plans.js';

describe('cleanup plans', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('writes an explicit plan and applies only its revalidated entry', async () => {
    root = buildTree({ node_modules: { file: 'x' }, dist: { file: 'x' } });
    backdate(root);
    const target = join(root, 'node_modules');
    const planFile = join(root, 'cleanup-plan.json');
    const code = await writePlan(
      {
        root,
        entries: [
          {
            path: target,
            relativePath: 'node_modules',
            ruleName: 'node_modules',
            lastModified: statSync(target).mtimeMs,
          },
        ],
      },
      planFile,
    );
    expect(code).toBe(0);
    expect(await applyPlan(planFile, true)).toBe(0);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(join(root, 'dist'))).toBe(true);
  });

  it('skips a candidate changed after planning', async () => {
    root = buildTree({ node_modules: { file: 'x' } });
    const target = join(root, 'node_modules');
    const planFile = join(root, 'cleanup-plan.json');
    await writePlan(
      {
        root,
        entries: [
          {
            path: target,
            relativePath: 'node_modules',
            ruleName: 'node_modules',
            lastModified: statSync(target).mtimeMs,
          },
        ],
      },
      planFile,
    );
    const newer = new Date(Date.now() + 10_000);
    utimesSync(target, newer, newer);
    expect(await applyPlan(planFile, true)).toBe(1);
    expect(existsSync(target)).toBe(true);
  });

  it('applies a marker entry only while its CACHEDIR.TAG is still present', async () => {
    const tag = 'Signature: 8a477f597d28d172789f06886806bc55\n';
    root = buildTree({
      kept: { 'CACHEDIR.TAG': tag, blob: 'x' },
      untagged: { 'CACHEDIR.TAG': tag },
    });
    backdate(root);
    const entry = (name: string) => ({
      path: join(root, name),
      relativePath: name,
      ruleName: 'CACHEDIR.TAG',
      kind: 'marker' as const,
      lastModified: null,
    });
    const planFile = join(root, 'plan.json');
    await writePlan({ root, entries: [entry('kept'), entry('untagged')] }, planFile);
    writeFileSync(join(root, 'untagged', 'CACHEDIR.TAG'), 'no longer a cache');
    const err: string[] = [];
    expect(await applyPlan(planFile, true, { stderr: (t) => err.push(t), stdout: () => {} })).toBe(
      1,
    );
    expect(existsSync(join(root, 'kept'))).toBe(false);
    expect(existsSync(join(root, 'untagged'))).toBe(true);
    expect(err).toEqual(['warning: skipped invalid plan entry untagged']);
  });

  it('rejects a marker entry naming an unknown marker rule', async () => {
    root = buildTree({ cache: { blob: 'x' } });
    const planFile = join(root, 'plan.json');
    await writePlan(
      {
        root,
        entries: [
          {
            path: join(root, 'cache'),
            relativePath: 'cache',
            ruleName: 'NOT.A.MARKER',
            kind: 'marker',
            lastModified: null,
          },
        ],
      },
      planFile,
    );
    expect(await applyPlan(planFile, true, { stderr: () => {}, stdout: () => {} })).toBe(1);
    expect(existsSync(join(root, 'cache'))).toBe(true);
  });

  it('skips an entry that became protected after planning', async () => {
    root = buildTree({ dist: { 'a.js': 'x' } });
    const planFile = join(root, 'plan.json');
    await writePlan(
      {
        root,
        entries: [
          { path: join(root, 'dist'), relativePath: 'dist', ruleName: 'dist', lastModified: null },
        ],
      },
      planFile,
    );
    writeFileSync(join(root, 'dist', 'program-keypair.json'), '[1]');
    const err: string[] = [];
    expect(await applyPlan(planFile, true, { stderr: (t) => err.push(t), stdout: () => {} })).toBe(
      1,
    );
    expect(existsSync(join(root, 'dist'))).toBe(true);
    expect(err).toEqual([
      'warning: skipped protected artifact dist (contains a *-keypair.json deploy key)',
    ]);
  });
});
