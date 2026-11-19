import { sep } from 'node:path';

import { errorCode } from '../errors.js';
import type { Io } from './io.js';
import { isSkippable } from './io.js';

/** What a directory tree holds, gathered in one traversal. */
export interface Measurement {
  /** Disk space the tree occupies and deleting it would free. */
  readonly bytes: number;
  /** Everything that is not a directory, symlinks included. */
  readonly files: number;
  /** Newest modification time (epoch ms) of anything inside, the directory itself included. */
  readonly lastActive: number;
}

const BLOCK = 512n;

/**
 * Measures `root` without following symlinks. Space is allocated blocks, like
 * `du`; a file hardlinked outside the tree (pnpm's store) only counts when
 * every one of its links lives inside, because only then does deleting the
 * tree actually free it. Directories that vanish mid-walk are skipped; any
 * other failure rejects, since a partial measurement would be a wrong one.
 */
export async function measure(root: string, io: Io, signal?: AbortSignal): Promise<Measurement> {
  let blocks = 0n;
  let files = 0;
  let lastActive = 0;
  const linked = new Map<string, { blocks: bigint; links: bigint; seen: bigint }>();

  const tally = (stats: Awaited<ReturnType<Io['lstat']>>): void => {
    lastActive = Math.max(lastActive, Number(stats.mtimeMs));
    if (stats.isDirectory() || stats.nlink <= 1n) {
      blocks += stats.blocks;
      return;
    }
    const key = `${stats.dev}:${stats.ino}`;
    const entry = linked.get(key);
    if (entry === undefined) {
      linked.set(key, { blocks: stats.blocks, links: stats.nlink, seen: 1n });
    } else {
      entry.seen += 1n;
    }
  };

  async function visitDirectory(dir: string): Promise<void> {
    signal?.throwIfAborted();
    let entries: Awaited<ReturnType<Io['readdir']>>;
    try {
      entries = await io.readdir(dir);
    } catch (error) {
      if (isGone(error)) return;
      throw error;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const path = `${dir}${sep}${entry.name}`;
        try {
          tally(await io.lstat(path));
        } catch (error) {
          if (isGone(error)) return;
          throw error;
        }
        if (entry.isDirectory()) await visitDirectory(path);
        else files++;
      }),
    );
  }

  tally(await io.lstat(root));
  await visitDirectory(root);

  for (const entry of linked.values()) {
    if (entry.seen === entry.links) blocks += entry.blocks;
  }
  return { bytes: Number(blocks * BLOCK), files, lastActive };
}

function isGone(error: unknown): boolean {
  return isSkippable(error) && errorCode(error) === 'ENOENT';
}
