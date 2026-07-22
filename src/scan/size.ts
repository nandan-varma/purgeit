import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pLimit, { type LimitFunction } from 'p-limit';

const execFileAsync = promisify(execFile);

let duAvailable: boolean | undefined;
let duProbe: Promise<boolean> | undefined;

async function checkDuAvailable(): Promise<boolean> {
  if (duAvailable !== undefined) return duAvailable;
  duProbe ??= (async () => {
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
  })();
  return duProbe;
}

/** Test-only: forces the next computeSize() call to re-probe `du` availability. */
export function resetDuAvailabilityCache(): void {
  duAvailable = undefined;
  duProbe = undefined;
}

/**
 * Batches multiple `du -s -k` calls into a single subprocess invocation.
 * Paths are accumulated and flushed when the batch reaches `maxBatchSize`
 * or after `flushDelayMs` milliseconds, whichever comes first. This reduces
 * process-fork overhead from O(n) to O(n/batchSize).
 */
class DuBatcher {
  private readonly maxBatchSize: number;
  private readonly flushDelayMs: number;
  private readonly limit: LimitFunction;
  private pending = new Map<
    string,
    { resolve: (bytes: number) => void; reject: (err: Error) => void }
  >();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private abortListener: (() => void) | undefined;

  constructor(opts: { maxBatchSize?: number; flushDelayMs?: number; limit?: LimitFunction } = {}) {
    this.maxBatchSize = opts.maxBatchSize ?? 32;
    this.flushDelayMs = opts.flushDelayMs ?? 10;
    this.limit = opts.limit as LimitFunction;
  }

  /**
   * Attach an AbortSignal so that aborting the scan immediately flushes
   * and rejects all pending size requests instead of hanging on the timer.
   */
  bindAbortSignal(signal: AbortSignal | undefined): void {
    if (signal === undefined || this.abortListener !== undefined) return;
    if (signal.aborted) {
      this.rejectAll(new Error('scan aborted'));
      return;
    }
    this.abortListener = () => {
      this.rejectAll(new Error('scan aborted'));
    };
    signal.addEventListener('abort', this.abortListener, { once: true });
  }

  private rejectAll(err: Error): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    for (const { reject } of this.pending.values()) reject(err);
    this.pending.clear();
  }

  sizeOf(path: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.pending.set(path, { resolve, reject });
      if (this.pending.size >= this.maxBatchSize) {
        this.flush();
      } else if (this.flushTimer === undefined) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = undefined;
          this.flush();
        }, this.flushDelayMs);
        // Allow Node to exit even if the timer is still pending.
        if (this.flushTimer.unref) this.flushTimer.unref();
      }
    });
  }

  private flush(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    /* v8 ignore next -- defensive; flush() is only called when pending.size > 0 */
    if (this.pending.size === 0) return;

    const batch = this.pending;
    this.pending = new Map();

    const paths = [...batch.keys()];
    void this.limit(() => this.runBatch(paths, batch));
  }

  private async runBatch(
    paths: string[],
    resolvers: Map<string, { resolve: (bytes: number) => void; reject: (err: Error) => void }>,
  ): Promise<void> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('du', ['-s', '-k', ...paths]));
    } catch {
      for (const { reject } of resolvers.values()) {
        reject(new Error('du batch failed'));
      }
      return;
    }

    const parsed = new Map<string, number>();
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const spaceIdx = trimmed.indexOf('\t');
      /* v8 ignore next -- defensive; du -s -k output always contains a tab separator */
      if (spaceIdx === -1) continue;
      const kb = Number.parseInt(trimmed.substring(0, spaceIdx), 10);
      const path = trimmed.substring(spaceIdx + 1);
      if (Number.isFinite(kb) && path !== '') {
        parsed.set(path, kb * 1024);
      }
    }

    for (const [path, { resolve, reject }] of resolvers) {
      const bytes = parsed.get(path);
      if (bytes !== undefined) {
        resolve(bytes);
      } else {
        // Path not in du output (permission denied, vanished, etc.) — fall back to JS.
        try {
          resolve(await computeSizeFallback(path, pLimit(8)));
          /* v8 ignore start -- defensive; computeSizeFallback catches all fs errors internally, so this catch is unreachable by design */
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
        /* v8 ignore stop */
      }
    }
  }
}

/**
 * Returns the real byte size of `path` (recursive if it's a directory).
 * Shells out to batched `du -s -k` calls (matches CLEANUP.sh, fast on the
 * macOS/Linux systems this is actually used on); falls back to a
 * concurrency-limited pure-Node walk if `du` is unavailable or fails on this
 * particular path (e.g. permission denied, or the path vanished mid-scan).
 */
export async function computeSize(
  path: string,
  opts: { concurrency?: number; batcher?: DuBatcher; limit?: LimitFunction } = {},
): Promise<number> {
  if (await checkDuAvailable()) {
    try {
      if (opts.batcher !== undefined) {
        return await opts.batcher.sizeOf(path);
      }
      const { stdout } = await execFileAsync('du', ['-s', '-k', path]);
      /* v8 ignore next -- noUncheckedIndexedAccess workaround; index 0 always exists at runtime */
      const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
      if (Number.isFinite(kb)) return kb * 1024;
    } catch {
      // fall through to the JS fallback below
    }
  }
  return computeSizeFallback(path, opts.limit ?? pLimit(opts.concurrency ?? 8));
}

/** Creates a DuBatcher scoped to the given concurrency limit. */
export function createDuBatcher(limit: LimitFunction): DuBatcher {
  return new DuBatcher({ limit });
}

async function computeSizeFallback(path: string, limit: LimitFunction): Promise<number> {
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
