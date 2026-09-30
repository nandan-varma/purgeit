import { symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backdate, buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { checkActivity } from './activity.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NO_FIND = 'purgeit-no-such-find-binary';

describe('checkActivity', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  for (const [label, find] of [
    ['find', 'find'],
    ['Node walk fallback', NO_FIND],
  ] as const) {
    describe(`via ${label}`, () => {
      it('is recent when a file deep inside changed, even though the directory mtime is old', async () => {
        root = buildTree({ node_modules: { pkg: { lib: { 'index.js': 'x' } } } });
        backdate(join(root, 'node_modules'));
        utimesSync(join(root, 'node_modules', 'pkg', 'lib', 'index.js'), new Date(), new Date());
        expect(await checkActivity(join(root, 'node_modules'), WEEK, find)).toBe('recent');
      });

      it('is idle when nothing inside changed within the window', async () => {
        root = buildTree({ dist: { a: { 'b.js': 'x' } } });
        backdate(join(root, 'dist'));
        expect(await checkActivity(join(root, 'dist'), WEEK, find)).toBe('idle');
      });

      it('is unknown when the path cannot be read', async () => {
        root = buildTree({});
        expect(await checkActivity(join(root, 'missing'), WEEK, find)).toBe('unknown');
      });
    });
  }

  it('treats a symlink inside by its own mtime, never following it', async () => {
    root = buildTree({ dist: {}, elsewhere: { 'fresh.js': 'x' } });
    symlinkSync(join(root, 'elsewhere'), join(root, 'dist', 'link'));
    backdate(join(root, 'dist'));
    utimesSync(join(root, 'dist'), new Date(0), new Date(0));
    const { lutimesSync } = await import('node:fs');
    lutimesSync(join(root, 'dist', 'link'), new Date(0), new Date(0));
    expect(await checkActivity(join(root, 'dist'), WEEK, NO_FIND)).toBe('idle');
    expect(await checkActivity(join(root, 'dist'), WEEK)).toBe('idle');
  });
});
