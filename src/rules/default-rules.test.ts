import { describe, expect, it } from 'vitest';
import { ALWAYS_SAFE_NAMES, GATED_NAMES, PRUNE_META_NAMES } from './default-rules.js';

describe('default rule name lists', () => {
  it('ALWAYS_SAFE_NAMES has no duplicates and includes the common JS/Python/Rust/Swift artifacts', () => {
    expect(new Set(ALWAYS_SAFE_NAMES).size).toBe(ALWAYS_SAFE_NAMES.length);
    for (const expected of [
      'node_modules',
      'dist',
      'target',
      '__pycache__',
      '.venv',
      'DerivedData',
    ]) {
      expect(ALWAYS_SAFE_NAMES).toContain(expected);
    }
  });

  it('GATED_NAMES has no duplicates and no overlap with ALWAYS_SAFE_NAMES', () => {
    expect(new Set(GATED_NAMES).size).toBe(GATED_NAMES.length);
    for (const name of GATED_NAMES) {
      expect(ALWAYS_SAFE_NAMES).not.toContain(name);
    }
  });

  it('PRUNE_META_NAMES covers common VCS metadata directories', () => {
    expect(PRUNE_META_NAMES).toEqual(['.git', '.hg', '.svn']);
  });
});
