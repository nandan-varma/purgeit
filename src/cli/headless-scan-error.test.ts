import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import type { ParsedCli } from './args.js';

vi.mock('../scan/scanner.js', async () => {
  const actual = await vi.importActual<typeof import('../scan/scanner.js')>('../scan/scanner.js');
  return {
    ...actual,
    // biome-ignore lint/correctness/useYield: mock intentionally throws without yielding to test error path
    scan: vi.fn(async function* () {
      throw new Error('scan boom');
    }),
  };
});

const { runHeadless } = await import('./headless.js');

function baseArgs(overrides: Partial<ParsedCli> = {}): ParsedCli {
  return {
    directory: '.',
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

describe('runHeadless scan error', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('returns exit code 2 when scan throws', async () => {
    root = buildTree({ node_modules: null });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root }), io);
    expect(code).toBe(2);
    expect(io.err.some((l) => l.includes('scan boom'))).toBe(true);
  });
});
