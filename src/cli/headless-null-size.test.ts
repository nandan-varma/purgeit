import { describe, expect, it, vi } from 'vitest';
import type { ParsedCli } from './args.js';

// An entry can legitimately still have `size: null` when the scan is
// aborted between its 'found' and 'size' events (e.g. Ctrl+C mid-scan in
// headless mode). This exercises the `size ?? 0` fallbacks in sorting,
// min-size filtering, the total-bytes reduce, and the preview line — a
// real scan()/abort race would be non-deterministic to reproduce here, so
// the scanner is mocked to yield exactly that shape instead. Two entries
// (one null, one resolved) are yielded so the size sort comparator — which
// Array.prototype.sort never invokes for a single-element array — actually
// runs and compares a null against a real size.
vi.mock('../scan/scanner.js', async () => {
  const actual = await vi.importActual<typeof import('../scan/scanner.js')>('../scan/scanner.js');
  return {
    ...actual,
    scan: vi.fn(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/fake/node_modules',
          project: 'fake',
          kind: 'always-safe',
          ruleName: 'node_modules',
          size: null,
        },
      };
      yield {
        type: 'found',
        entry: {
          path: '/fake/dist',
          project: 'fake',
          kind: 'always-safe',
          ruleName: 'dist',
          size: 1024,
        },
      };
      yield { type: 'done', totalBytes: 1024 };
    }),
  };
});

const { runHeadless } = await import('./headless.js');

function baseArgs(overrides: Partial<ParsedCli> = {}): ParsedCli {
  return {
    directory: '/fake',
    full: true,
    project: undefined,
    exclude: [],
    targets: [],
    minSize: undefined,
    depth: undefined,
    configPath: undefined,
    noConfig: true,
    noGated: false,
    sort: 'size',
    ascending: false,
    dryRun: false,
    delete: false,
    yes: false,
    json: false,
    tui: false,
    headless: true,
    concurrency: 8,
    color: undefined,
    ...overrides,
  };
}

function captureIO() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
  };
}

describe('runHeadless with an unresolved (null) size', () => {
  it('treats it as 0 bytes for sorting, min-size filtering, and totals', async () => {
    const io = captureIO();
    const code = await runHeadless(baseArgs(), io);
    expect(code).toBe(0);
    expect(io.out.some((l) => l.includes('node_modules'))).toBe(true);
    expect(io.out.some((l) => l.includes('0 B'))).toBe(true);
    // Descending size sort (the default) puts the resolved 1KB entry first.
    const lines = io.out.filter((l) => l.includes('/fake/'));
    expect(lines[0]).toContain('dist');
    expect(lines[1]).toContain('node_modules');
  });

  it('is excluded by a --min-size above every resolved entry', async () => {
    const io = captureIO();
    const code = await runHeadless(baseArgs({ minSize: '2KB' }), io);
    expect(code).toBe(1);
    expect(io.out).toContain('Nothing to clean.');
  });

  it('sorts correctly in ascending order too', async () => {
    // Sorting both directions forces the comparator to be invoked with the
    // null-size entry in both the `a` and `b` position across the two runs
    // (Array.prototype.sort's exact call order for 2 elements is
    // engine-defined and only guaranteed to differ when direction flips).
    const io = captureIO();
    const code = await runHeadless(baseArgs({ ascending: true }), io);
    expect(code).toBe(0);
    const lines = io.out.filter((l) => l.includes('/fake/'));
    expect(lines[0]).toContain('node_modules');
    expect(lines[1]).toContain('dist');
  });
});
