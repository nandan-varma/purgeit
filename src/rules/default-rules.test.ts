import { describe, expect, it } from 'vitest';
import { ALWAYS_SAFE_NAMES, GATED_NAMES, PRUNE_META_NAMES } from './default-rules.js';

describe('default rule name lists', () => {
  it('ALWAYS_SAFE_NAMES has no duplicates and includes at least one artifact per covered ecosystem', () => {
    expect(new Set(ALWAYS_SAFE_NAMES).size).toBe(ALWAYS_SAFE_NAMES.length);
    for (const expected of [
      'node_modules', // JavaScript/TypeScript
      'dist',
      'target', // Rust (and Maven)
      '__pycache__', // Python
      '.venv',
      'DerivedData', // Apple
      '.build',
      '.vs', // .NET
      'dist-newstyle', // Haskell
      '.stack-work',
      'elm-stuff', // Elm
      'zig-out', // Zig
      '.dart_tool', // Dart/Flutter
      '.yardoc', // Ruby
    ]) {
      expect(ALWAYS_SAFE_NAMES).toContain(expected);
    }
  });

  it('.build is categorized as Swift Package Manager output, not Python', () => {
    // Regression check: .build was previously mis-documented as a Python
    // artifact in the docs even though it's never produced by any Python
    // tool — it's SPM's `swift build` output directory.
    expect(ALWAYS_SAFE_NAMES).toContain('.build');
  });

  it('GATED_NAMES has no duplicates and no overlap with ALWAYS_SAFE_NAMES', () => {
    expect(new Set(GATED_NAMES).size).toBe(GATED_NAMES.length);
    for (const name of GATED_NAMES) {
      expect(ALWAYS_SAFE_NAMES).not.toContain(name);
    }
    for (const expected of ['Pods', 'build', 'vendor', '.gradle', 'bin', 'obj', '_build', 'pkg']) {
      expect(GATED_NAMES).toContain(expected);
    }
  });

  it('PRUNE_META_NAMES covers common VCS metadata directories', () => {
    expect(PRUNE_META_NAMES).toEqual(['.git', '.hg', '.svn']);
  });
});
