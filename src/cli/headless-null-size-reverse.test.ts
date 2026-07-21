import { describe, expect, it, vi } from 'vitest';
import type { ParsedCli } from './args.js';

// Companion to headless-null-size.test.ts: Array.prototype.sort on a
// 2-element array calls the comparator exactly once, with `a`/`b` bound to
// the original array order — so a single ordering only ever exercises the
// null-size fallback from one side of `(a.size ?? 0) - (b.size ?? 0)`.
// Yielding the resolved entry first and the null one second here covers the
// other side (a resolved, b null) that the sibling file's ordering can't reach.
vi.mock('../scan/scanner.js', async () => {
  const actual = await vi.importActual<typeof import('../scan/scanner.js')>('../scan/scanner.js');
  return {
    ...actual,
    scan: vi.fn(async function* () {
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

describe('runHeadless sorting with the resolved entry discovered first', () => {
  it('still sorts the null-size entry consistently', async () => {
    const io = captureIO();
    const code = await runHeadless(baseArgs(), io);
    expect(code).toBe(0);
    const lines = io.out.filter((l) => l.includes('/fake/'));
    expect(lines[0]).toContain('dist');
    expect(lines[1]).toContain('node_modules');
  });
});
