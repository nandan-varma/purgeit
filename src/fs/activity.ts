import { sep } from 'node:path';

import type { Io } from './io.js';

/**
 * True as soon as anything inside `path` (or `path` itself) was modified at or
 * after `since` (epoch ms). Stops at the first hit, never follows symlinks, and
 * rejects when the tree cannot be read — callers must treat that as "unknown",
 * never as "idle".
 */
export async function hasActivitySince(path: string, since: number, io: Io): Promise<boolean> {
  let found = false;

  async function visit(current: string): Promise<void> {
    if (found) return;
    const stats = await io.lstat(current);
    if (Number(stats.mtimeMs) >= since) {
      found = true;
      return;
    }
    if (!stats.isDirectory()) return;
    const entries = await io.readdir(current);
    await Promise.all(entries.map((entry) => visit(`${current}${sep}${entry.name}`)));
  }

  await visit(path);
  return found;
}
