import type { BigIntStats, Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';

import { errorCode } from '../errors.js';

/**
 * The only door to the filesystem for traversal, injectable so tests can
 * observe it. Calls are deliberately unthrottled: libuv's thread pool is the
 * real bound on concurrent syscalls, and a JS-side limiter measured ~35%
 * slower on a 30k-file tree while bounding nothing the pool does not.
 */
export interface Io {
  readdir(path: string): Promise<Dirent[]>;
  lstat(path: string): Promise<BigIntStats>;
}

export function createIo(): Io {
  return {
    readdir: (path) => readdir(path, { withFileTypes: true }),
    lstat: (path) => lstat(path, { bigint: true }),
  };
}

const SKIPPABLE = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP']);

/** A directory that vanished or may not be read is routine on a real disk; anything else is a bug. */
export function isSkippable(error: unknown): boolean {
  return SKIPPABLE.has(errorCode(error) ?? '');
}
