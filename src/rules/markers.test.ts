import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { MARKER_RULES } from './default-rules.js';
import { findMarker, hasMarker } from './markers.js';

const CACHEDIR = MARKER_RULES.get('CACHEDIR.TAG') as { file: string; signature: string };
const TAG = `${CACHEDIR.signature}\n# This file is a cache directory tag.\n`;

describe('hasMarker', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('accepts a file that starts with the signature', async () => {
    root = buildTree({ cache: { 'CACHEDIR.TAG': TAG } });
    expect(await hasMarker(join(root, 'cache'), CACHEDIR)).toBe(true);
  });

  it('rejects a wrong signature, a truncated file, a missing file and a directory of that name', async () => {
    root = buildTree({
      wrong: { 'CACHEDIR.TAG': 'Signature: 00000000000000000000000000000000\n' },
      short: { 'CACHEDIR.TAG': 'Signature: 8a47' },
      missing: {},
      dir: { 'CACHEDIR.TAG': {} },
    });
    for (const name of ['wrong', 'short', 'missing', 'dir']) {
      expect(await hasMarker(join(root, name), CACHEDIR)).toBe(false);
    }
  });
});

describe('findMarker', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('returns the matching rule name', async () => {
    root = buildTree({ 'CACHEDIR.TAG': TAG });
    expect(await findMarker(root, MARKER_RULES)).toBe('CACHEDIR.TAG');
  });

  it('skips markers the caller already knows are absent, without opening them', async () => {
    root = buildTree({ 'CACHEDIR.TAG': TAG });
    expect(await findMarker(root, MARKER_RULES, () => false)).toBeUndefined();
  });

  it('returns undefined when no marker matches', async () => {
    root = buildTree({ file: 'x' });
    expect(await findMarker(root, MARKER_RULES)).toBeUndefined();
  });
});
