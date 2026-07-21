import { homedir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import type { ParsedCli } from './args.js';

// deleteEntries() refuses to touch the home directory / filesystem root as
// a last line of defense (see delete/deleter.ts's isDangerousPath). Forcing
// a match to resolve to homedir() here exercises that real, deterministic
// refusal end-to-end through runHeadless's delete loop — the 'error' event
// branch and the failedCount > 0 exit-code branch — without relying on a
// racy real rm() failure.
vi.mock('../scan/scanner.js', async () => {
  const actual = await vi.importActual<typeof import('../scan/scanner.js')>('../scan/scanner.js');
  return {
    ...actual,
    scan: vi.fn(async function* () {
      yield {
        type: 'found',
        entry: {
          path: homedir(),
          project: 'fake',
          kind: 'always-safe',
          ruleName: 'node_modules',
          size: 0,
        },
      };
      yield { type: 'done', totalBytes: 0 };
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
    delete: true,
    yes: true,
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

describe('runHeadless deletion safety guard', () => {
  it('reports a failure and exits 1 when a match refuses to delete', async () => {
    const io = captureIO();
    const code = await runHeadless(baseArgs(), io);
    expect(code).toBe(1);
    expect(io.err.some((l) => l.includes('refusing to delete'))).toBe(true);
    expect(io.out.some((l) => l.includes('0 deleted, 1 failed'))).toBe(true);
  });
});
