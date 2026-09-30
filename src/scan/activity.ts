import { spawn } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Whether anything inside an artifact changed within a time window:
 * - `recent` — the directory itself or some entry below it was modified
 * - `idle` — nothing was, so the artifact is genuinely unused
 * - `unknown` — the check failed; callers must treat it like `recent`
 */
export type Activity = 'recent' | 'idle' | 'unknown';

/**
 * A directory's own mtime only moves when entries are added or removed at its
 * top level, so `node_modules` of a project installed weeks ago but rebuilt
 * yesterday still looks old. This looks at every entry below `path` instead,
 * stopping at the first recent one. Uses `find -mmin -N -print -quit` (native
 * speed, never follows symlinks), falling back to a Node walk where `find`
 * isn't installed.
 */
export async function checkActivity(
  path: string,
  withinMs: number,
  find = 'find',
): Promise<Activity> {
  const viaFind = await activityViaFind(path, withinMs, find);
  return viaFind === 'no-find' ? activityViaWalk(path, Date.now() - withinMs) : viaFind;
}

function activityViaFind(
  path: string,
  withinMs: number,
  find: string,
): Promise<Activity | 'no-find'> {
  const minutes = Math.max(1, Math.ceil(withinMs / 60_000));
  return new Promise((resolve) => {
    const child = spawn(find, [path, '-mmin', `-${minutes}`, '-print', '-quit'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('error', () => resolve('no-find'));
    child.once('close', (code) => {
      if (output.length > 0) resolve('recent');
      else resolve(code === 0 ? 'idle' : 'unknown');
    });
  });
}

async function activityViaWalk(path: string, sinceMs: number): Promise<Activity> {
  try {
    const stats = await lstat(path);
    if (stats.mtimeMs >= sinceMs) return 'recent';
    if (!stats.isDirectory()) return 'idle';
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const verdict = await activityViaWalk(join(path, entry.name), sinceMs);
      if (verdict !== 'idle') return verdict;
    }
    return 'idle';
  } catch {
    return 'unknown';
  }
}
