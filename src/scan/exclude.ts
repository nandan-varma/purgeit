import { relative, sep } from 'node:path';
import { globToRegExp } from '../rules/gate-context.js';

/**
 * Builds a `--exclude`-style path predicate: true if `path` (made relative
 * to `root` and POSIX-normalized) matches any of the given glob patterns.
 * Shared between the headless runner and the TUI so both honor `--exclude`
 * identically.
 */
export function createExcludeMatcher(
  root: string,
  patterns: readonly string[],
): (path: string) => boolean {
  if (patterns.length === 0) return () => false;
  const matchers = patterns.map((pattern) => globToRegExp(pattern));
  return (path: string) => {
    const rel = relative(root, path).split(sep).join('/');
    return matchers.some((re) => re.test(rel));
  };
}
