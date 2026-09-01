import { existsSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { applyPlan, writePlan } from './plans.js';

describe('cleanup plans', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('writes an explicit plan and applies only its revalidated entry', async () => {
    root = buildTree({ node_modules: { file: 'x' }, dist: { file: 'x' } });
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
});
