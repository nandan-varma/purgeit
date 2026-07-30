import { describe, expect, it, vi } from 'vitest';
import type { ParsedCli } from './args.js';

// An entry can legitimately never receive a 'lastModified' event (e.g. its
// stat() call fails and is swallowed — see scanner.ts's handleMatch — or the
// scan is aborted before it resolves). This exercises the
// `lastModified === undefined` fallback in --min-age/--max-age filtering and
// the `?? null` fallback in JSON output — a real stat() failure would be
// hard to reproduce deterministically, so the scanner is mocked to yield
// exactly that shape instead.
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
          lastModified: null,
        },
      };
      yield { type: 'size', path: '/fake/node_modules', bytes: 1024 };
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
    minAge: undefined,
    maxAge: undefined,
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

describe('runHeadless with an unresolved (null) lastModified', () => {
  it('is excluded by a --min-age filter since its age can never be known', async () => {
    const io = captureIO();
    const code = await runHeadless(baseArgs({ minAge: '1d' }), io);
    expect(code).toBe(1);
    expect(io.out).toContain('Nothing to clean.');
  });

  it('is excluded by a --max-age filter too', async () => {
    const io = captureIO();
    const code = await runHeadless(baseArgs({ maxAge: '1d' }), io);
    expect(code).toBe(1);
    expect(io.out).toContain('Nothing to clean.');
  });

  it('reports lastModified as null in JSON output when no age filter is set', async () => {
    const io = captureIO();
    const code = await runHeadless(baseArgs({ json: true }), io);
    expect(code).toBe(0);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].lastModified).toBeNull();
  });
});
