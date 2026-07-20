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
});
