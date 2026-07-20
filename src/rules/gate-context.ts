import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GateContext } from '../types.js';

/** Converts a shell-style glob (`*`/`?` wildcards only) to an anchored RegExp. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${withWildcards}$`);
}

/** Builds a GateContext backed by real, synchronous fs calls scoped to `path`'s parent. */
export function createGateContext(path: string): GateContext {
  const parent = dirname(path);
  return {
    path,
    parent,
    siblingFile(name: string): boolean {
      return existsSync(join(parent, name));
    },
    siblingGlob(pattern: string): boolean {
      const re = globToRegExp(pattern);
      let entries: string[];
      try {
        entries = readdirSync(parent);
      } catch {
        return false;
      }
      return entries.some((entry) => re.test(entry));
    },
    siblingGrep(name: string, pattern: RegExp): boolean {
      try {
        const raw = readFileSync(join(parent, name), 'utf8');
        return pattern.test(raw);
      } catch {
        return false;
      }
    },
  };
}
