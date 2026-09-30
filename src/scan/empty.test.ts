import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { isEmptyTree } from './empty.js';

describe('isEmptyTree', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('is true for a directory holding only (nested) empty directories', async () => {
    root = buildTree({ a: { b: {}, c: { d: {} } } });
    expect(await isEmptyTree(join(root, 'a'))).toBe(true);
  });

  it('is false as soon as any file exists, however deep', async () => {
    root = buildTree({ a: { b: { c: { f: '' } } } });
    expect(await isEmptyTree(join(root, 'a'))).toBe(false);
  });

  it('counts a symlink as content and an unreadable path as not empty', async () => {
    root = buildTree({ a: {}, target: {} });
    symlinkSync(join(root, 'target'), join(root, 'a', 'link'));
    expect(await isEmptyTree(join(root, 'a'))).toBe(false);
    expect(await isEmptyTree(join(root, 'missing'))).toBe(false);
  });
});
