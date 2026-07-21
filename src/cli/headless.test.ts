import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import type { ParsedCli } from './args.js';
import { runHeadless } from './headless.js';

function baseArgs(overrides: Partial<ParsedCli> = {}): ParsedCli {
  return {
    directory: '.',
    full: true, // flat mode: root itself is the scan unit, no project grouping
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

describe('runHeadless', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('prints a dry-run preview and exits 0 when matches are found', async () => {
    root = buildTree({ node_modules: { f: 'x'.repeat(1000) } });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root }), io);
    expect(code).toBe(0);
    expect(io.out.some((l) => l.includes('node_modules'))).toBe(true);
    expect(io.out.some((l) => l.includes('Run with --delete'))).toBe(true);
    expect(existsSync(join(root, 'node_modules'))).toBe(true);
  });

  it('exits 1 and prints "Nothing to clean." when nothing is found', async () => {
    root = buildTree({ 'readme.txt': 'hi' });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root }), io);
    expect(code).toBe(1);
    expect(io.out).toContain('Nothing to clean.');
  });

  it('emits JSON when --json is passed', async () => {
    root = buildTree({ node_modules: { f: 'x'.repeat(100) } });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, json: true }), io);
    expect(code).toBe(0);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].ruleName).toBe('node_modules');
    expect(payload.totalBytes).toBeGreaterThan(0);
  });

  it('exits 1 with --json when nothing is found', async () => {
    root = buildTree({ 'readme.txt': 'hi' });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, json: true }), io);
    expect(code).toBe(1);
  });

  it('reports warnings for malformed manifests to stderr (projects mode)', async () => {
    root = buildTree({ broken: { 'package.json': '{not json', node_modules: null } });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, full: false }), io);
    expect(io.err.some((l) => l.includes('invalid JSON'))).toBe(true);
  });

  it('rejects an invalid --min-size string with exit code 2', async () => {
    root = buildTree({});
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, minSize: 'not-a-size' }), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid size/);
  });

  it('filters out matches below --min-size', async () => {
    root = buildTree({
      small: { node_modules: { f: 'x'.repeat(5) } },
      big: { dist: { f: 'y'.repeat(1_000_000) } },
    });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, minSize: '100KB' }), io);
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines.some((l) => l.includes('dist'))).toBe(true);
    expect(lines.some((l) => l.includes('node_modules'))).toBe(false);
  });

  it('excludes matches via --exclude glob', async () => {
    root = buildTree({ keep: { node_modules: null }, skip: { node_modules: null } });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, exclude: ['skip/*'] }), io);
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines.some((l) => l.includes(join('keep', 'node_modules')))).toBe(true);
    expect(lines.some((l) => l.includes(join('skip', 'node_modules')))).toBe(false);
  });

  it('restricts matching via --targets (literal name)', async () => {
    root = buildTree({ node_modules: null, dist: null });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, targets: ['dist'] }), io);
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines.some((l) => l.includes('dist'))).toBe(true);
    expect(lines.some((l) => l.includes('node_modules'))).toBe(false);
  });

  it('disables gated rules with --no-gated', async () => {
    root = buildTree({ Podfile: 'platform :ios\n', Pods: null });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, noGated: true }), io);
    expect(code).toBe(1); // Pods would normally match, but gated rules are off
  });

  it('sorts by size ascending/descending', async () => {
    root = buildTree({
      node_modules: { f: 'x'.repeat(100) },
      dist: { f: 'y'.repeat(1_000_000) },
    });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, sort: 'size', ascending: true }), io);
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines[0]).toContain('node_modules');
  });

  it('sorts by name', async () => {
    root = buildTree({ node_modules: null, dist: null });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, sort: 'name', ascending: true }), io);
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines[0]).toContain('dist');
  });

  it('sorts by path', async () => {
    root = buildTree({ a: { node_modules: null }, b: { node_modules: null } });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, sort: 'path', ascending: true }), io);
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines[0]).toContain(join('a', 'node_modules'));
  });

  it('--delete with --yes deletes without prompting', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, delete: true, yes: true }), io);
    expect(code).toBe(0);
    expect(existsSync(join(root, 'node_modules'))).toBe(false);
    expect(io.out.some((l) => l.includes('1 deleted, 0 failed'))).toBe(true);
  });

  it('--delete without --yes prompts and respects a "no" answer', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, delete: true }), {
      ...io,
      confirm: async () => false,
    });
    expect(code).toBe(0);
    expect(io.out).toContain('Aborted.');
    expect(existsSync(join(root, 'node_modules'))).toBe(true);
  });

  it('--delete without --yes deletes when confirm resolves true', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, delete: true }), {
      ...io,
      confirm: async () => true,
    });
    expect(code).toBe(0);
    expect(existsSync(join(root, 'node_modules'))).toBe(false);
  });

  it('--delete --dry-run simulates deletion without touching the filesystem', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const io = captureIO();
    const code = await runHeadless(
      baseArgs({ directory: root, delete: true, yes: true, dryRun: true }),
      io,
    );
    expect(code).toBe(0);
    expect(existsSync(join(root, 'node_modules'))).toBe(true);
    expect(io.out.some((l) => l.includes('(dry-run) deleted'))).toBe(true);
  });

  it('reports a rejected config load with exit code 2', async () => {
    root = buildTree({ 'purgeit.config.json': '{"extends":"bogus"}' });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, noConfig: false }), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid config/);
  });
});

describe('runHeadless default I/O paths', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('uses process.stdout/stderr when io.stdout/stderr are not provided', async () => {
    root = buildTree({ node_modules: { f: 'x'.repeat(1000) } });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const code = await runHeadless(baseArgs({ directory: root }), { cwd: root });
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('uses all defaults when io object is minimal', async () => {
    root = buildTree({ 'readme.txt': 'hi' });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const code = await runHeadless(baseArgs({ directory: root }), {});
      expect(code).toBe(1);
      expect(stdoutSpy).toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('writes to the real process.stderr by default when something is reported', async () => {
    root = buildTree({});
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const code = await runHeadless(baseArgs({ directory: root, minSize: 'not-a-size' }), {});
      expect(code).toBe(2);
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe('runHeadless error handling', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('uses defaultConfirm when io.confirm is not provided', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const rlMock = { question: vi.fn(async () => 'y'), close: vi.fn() };
    vi.doMock('node:readline/promises', () => ({
      createInterface: vi.fn(() => rlMock),
    }));
    try {
      const io = captureIO();
      const code = await runHeadless(baseArgs({ directory: root, delete: true }), {
        stdout: io.stdout,
        stderr: io.stderr,
      });
      expect(code).toBe(0);
      expect(rlMock.question).toHaveBeenCalled();
    } finally {
      vi.doUnmock('node:readline/promises');
    }
  });
});
