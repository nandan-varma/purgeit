import { tmpdir } from 'node:os';
import pLimit from 'p-limit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';

// Real `execFile` exposes a `util.promisify.custom` implementation (resolves
// with `{ stdout, stderr }`); a plain vi.fn() wouldn't, so promisify(mock)
// would instead resolve with an array of callback args. Mirror that custom
// behavior here so computeSize's `const { stdout } = await execFileAsync(...)`
// destructuring works exactly like it does against the real function.
// `vi.hoisted` runs before any import binding is initialized, so the
// well-known symbol is referenced directly rather than via `util.promisify`.
const execFileMock = vi.hoisted(() => {
  const fn = vi.fn(
    (
      _cmd: string,
      _args: string[],
      callback: (err: Error | null, stdout?: string, stderr?: string) => void,
    ) => {
      callback(new Error('unconfigured mock call'));
    },
  );
  Object.assign(fn, {
    [Symbol.for('nodejs.util.promisify.custom')]: (cmd: string, args: string[]) =>
      new Promise((resolve, reject) => {
        fn(cmd, args, (err, stdout, stderr) => {
          if (err) reject(err);
          else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        });
      }),
  });
  return fn;
});

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

function mockDuOk(stdoutFor: (path: string) => string) {
  execFileMock.mockImplementation((_cmd, args: string[], cb) => {
    const path = args[args.length - 1] ?? '';
    cb(null, stdoutFor(path), '');
  });
}

function mockDuMissing() {
  execFileMock.mockImplementation((_cmd, _args, cb) => {
    cb(Object.assign(new Error('not found'), { code: 'ENOENT' }));
  });
}

describe('computeSize', () => {
  let root: string;

  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockClear();
  });

  afterEach(() => {
    if (root) cleanupTree(root);
  });

  it('uses du by default and parses its KB output into bytes', async () => {
    mockDuOk(() => '4\t/some/path\n');
    const { computeSize } = await import('./size.js');
    const bytes = await computeSize('/some/path');
    expect(bytes).toBe(4 * 1024);
  });

  it('caches the du-availability probe across calls (one probe, N real invocations)', async () => {
    mockDuOk(() => '4\t/x\n');
    const { computeSize } = await import('./size.js');
    await computeSize('/a');
    await computeSize('/b');
    // 1 probe call + 2 real per-path calls.
    expect(execFileMock).toHaveBeenCalledTimes(3);
  });

  it('resetDuAvailabilityCache forces a fresh probe on the next call', async () => {
    mockDuOk(() => '4\t/x\n');
    const { computeSize, resetDuAvailabilityCache } = await import('./size.js');
    await computeSize('/a'); // 1 probe + 1 real call
    resetDuAvailabilityCache();
    await computeSize('/b'); // 1 more probe + 1 more real call
    expect(execFileMock).toHaveBeenCalledTimes(4);
  });

  it('falls back to the pure-Node walk when du is unavailable (ENOENT)', async () => {
    mockDuMissing();
    const { computeSize } = await import('./size.js');
    root = buildTree({ a: 'hello', nested: { b: 'world!' } });
    const bytes = await computeSize(root);
    expect(bytes).toBe('hello'.length + 'world!'.length);
  });

  it('falls back when du fails on this specific path (e.g. permission denied)', async () => {
    let call = 0;
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      call++;
      if (call === 1) {
        cb(null, '4\t/tmp\n', ''); // availability probe succeeds
      } else {
        cb(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
      }
    });
    const { computeSize } = await import('./size.js');
    root = buildTree({ a: 'hi' });
    const bytes = await computeSize(root);
    expect(bytes).toBe(2);
  });

  it('fallback treats an unreadable path as 0 bytes', async () => {
    mockDuMissing();
    const { computeSize } = await import('./size.js');
    const bytes = await computeSize('/definitely/does/not/exist/anywhere');
    expect(bytes).toBe(0);
  });

  it('fallback never follows a symlink', async () => {
    mockDuMissing();
    const { computeSize } = await import('./size.js');
    root = buildTree({ real: 'x'.repeat(100) });
    const { symlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    symlinkSync(join(root, 'real'), join(root, 'link'));
    const bytes = await computeSize(join(root, 'link'));
    expect(bytes).toBe(0);
  });

  it('fallback returns 0 for a directory it cannot list (readdir fails after lstat succeeds)', async () => {
    if (process.getuid?.() === 0) return; // root bypasses permission checks
    if (process.platform === 'win32') return; // chmod has no effect on NTFS
    mockDuMissing();
    const { computeSize } = await import('./size.js');
    const { chmodSync } = await import('node:fs');
    const { join } = await import('node:path');
    root = buildTree({ locked: { secret: 'x' } });
    const lockedDir = join(root, 'locked');
    chmodSync(lockedDir, 0o300); // execute+write but no read -> readdir fails, lstat still succeeds
    try {
      const bytes = await computeSize(lockedDir);
      expect(bytes).toBe(0);
    } finally {
      chmodSync(lockedDir, 0o700); // restore so cleanupTree can remove it
    }
  });

  it('DuBatcher rejects all pending promises when du batch fails', async () => {
    let call = 0;
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      call++;
      if (call === 1) {
        cb(null, '4\t/tmp\n', ''); // availability probe succeeds
      } else {
        cb(Object.assign(new Error('du batch failed'), { code: 'EACCES' }));
      }
    });
    const { computeSize, createDuBatcher } = await import('./size.js');
    const batcher = createDuBatcher(pLimit(8));
    root = buildTree({ a: 'x', b: 'y' });
    const { join } = await import('node:path');
    // Both calls go to the batcher; du fails on the batch, triggering the JS fallback
    const [sizeA, sizeB] = await Promise.all([
      computeSize(join(root, 'a'), { batcher }),
      computeSize(join(root, 'b'), { batcher }),
    ]);
    expect(sizeA).toBe(1);
    expect(sizeB).toBe(1);
  });

  it('DuBatcher falls back to JS when a path is missing from du output', async () => {
    let call = 0;
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      call++;
      if (call === 1) {
        cb(null, '4\t/tmp\n', ''); // availability probe succeeds
      } else {
        // Only return output for one path, omit the other
        cb(null, '10\t/existing\n', '');
      }
    });
    const { computeSize, createDuBatcher } = await import('./size.js');
    const batcher = createDuBatcher(pLimit(8));
    root = buildTree({ existing: 'x'.repeat(10240), missing: 'hi' });
    const { join } = await import('node:path');
    const bytes = await computeSize(join(root, 'missing'), { batcher });
    expect(bytes).toBe(2);
  });

  it('DuBatcher clears pending timer when batch fills before timer fires', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], cb) => {
      if (args.includes(tmpdir())) {
        cb(null, '0\t/\n', '');
        return;
      }
      const paths = args.slice(2);
      cb(null, paths.map((p) => `1\t${p}\n`).join(''), '');
    });
    const { computeSize, createDuBatcher } = await import('./size.js');
    const batcher = createDuBatcher(pLimit(8));
    // Submit 33 items synchronously — the 32nd triggers flush() while the
    // 10 ms timer from the 1st item is still pending, exercising the
    // clearTimeout(flushTimer) branch in flush().
    const promises: Promise<number>[] = [];
    for (let i = 0; i < 33; i++) {
      promises.push(computeSize(`/test/${i}`, { batcher }));
    }
    const results = await Promise.all(promises);
    expect(results).toHaveLength(33);
    expect(results.every((r) => r === 1024)).toBe(true);
  });
});
