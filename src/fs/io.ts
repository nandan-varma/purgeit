import type { BigIntStats, Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';

import { errorCode } from '../errors.js';

// Calls are deliberately unthrottled: libuv's thread pool is the real bound on
// concurrent syscalls, and a JS-side limiter measured ~35% slower on a 30k-file
// tree while bounding nothing the pool does not.

/** A directory's entries, with their types (so most need no stat). */
export const listDir = (path: string): Promise<Dirent[]> => readdir(path, { withFileTypes: true });

/** Stats a path without following symlinks. */
export const statEntry = (path: string): Promise<BigIntStats> => lstat(path, { bigint: true });

const SKIPPABLE = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP']);

/** A directory that vanished or may not be read is routine on a real disk; anything else is a bug. */
export function isSkippable(error: unknown): boolean {
  return SKIPPABLE.has(errorCode(error) ?? '');
}
