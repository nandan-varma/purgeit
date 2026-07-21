import { describe, expect, it } from 'vitest';
import { createExcludeMatcher } from './exclude.js';

describe('createExcludeMatcher', () => {
  it('never excludes anything when no patterns are given', () => {
    const isExcluded = createExcludeMatcher('/root', []);
    expect(isExcluded('/root/a/node_modules')).toBe(false);
  });

  it('excludes paths whose root-relative POSIX path matches a glob pattern', () => {
    const isExcluded = createExcludeMatcher('/root', ['skip/*']);
    expect(isExcluded('/root/skip/node_modules')).toBe(true);
    expect(isExcluded('/root/keep/node_modules')).toBe(false);
  });

  it('matches against any of multiple patterns', () => {
    const isExcluded = createExcludeMatcher('/root', ['a/*', 'b/*']);
    expect(isExcluded('/root/a/x')).toBe(true);
    expect(isExcluded('/root/b/x')).toBe(true);
    expect(isExcluded('/root/c/x')).toBe(false);
  });
});
