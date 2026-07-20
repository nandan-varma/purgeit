import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pLimit from 'p-limit';

const execFileAsync = promisify(execFile);

let duAvailable: boolean | undefined;

async function checkDuAvailable(): Promise<boolean> {
  if (duAvailable !== undefined) return duAvailable;
  try {
    // A real, harmless probe call (`du -s -k` on a directory that always
    // exists) rather than `du --version`, since BSD du (macOS) doesn't
    // support --version but does support -s -k identically to GNU du.
    await execFileAsync('du', ['-s', '-k', tmpdir()]);
    duAvailable = true;
  } catch (err) {
    // ENOENT means the binary itself is missing; any other error means it
    // ran (even if it exited non-zero for some other reason), so it exists.
    duAvailable = (err as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  return duAvailable;
}

/** Test-only: forces the next computeSize() call to re-probe `du` availability. */
export function resetDuAvailabilityCache(): void {
  duAvailable = undefined;
}

/**
 * Returns the real byte size of `path` (recursive if it's a directory).
 * Shells out to `du -s -k` by default (matches CLEANUP.sh, fast on the
 * macOS/Linux systems this is actually used on); falls back to a
 * concurrency-limited pure-Node walk if `du` is unavailable or fails on this
 * particular path (e.g. permission denied, or the path vanished mid-scan).
 */
export async function computeSize(
  path: string,
  opts: { concurrency?: number } = {},
): Promise<number> {
  if (await checkDuAvailable()) {
    try {
      const { stdout } = await execFileAsync('du', ['-s', '-k', path]);
      /* v8 ignore next -- String.split never returns an empty array, so index 0 always exists at runtime; the `?? ''` only satisfies noUncheckedIndexedAccess */
      const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
      if (Number.isFinite(kb)) return kb * 1024;
    } catch {
      // fall through to the JS fallback below
    }
  }
  return computeSizeFallback(path, opts.concurrency ?? 8);
}

async function computeSizeFallback(path: string, concurrency: number): Promise<number> {
  const limit = pLimit(concurrency);

  async function sizeOf(p: string): Promise<number> {
    let stat: import('node:fs').Stats;
    try {
      stat = await lstat(p);
    } catch {
      return 0;
    }
    if (stat.isSymbolicLink()) return 0;
    if (!stat.isDirectory()) return stat.size;

    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(p, { withFileTypes: true });
    } catch {
      return 0;
    }

    const sizes = await Promise.all(
      entries.map((entry) => limit(() => sizeOf(join(p, entry.name)))),
    );
    return sizes.reduce((total, size) => total + size, 0);
  }

  return sizeOf(path);
}
