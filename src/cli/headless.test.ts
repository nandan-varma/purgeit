import { existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backdate, buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import type { ParsedCli } from './args.js';
import { isCloudSynced, runHeadless, tildify } from './headless.js';

function baseArgs(overrides: Partial<ParsedCli> = {}): ParsedCli {
  return {
    directory: '.',
    full: true, // flat mode: root itself is the scan unit, no project grouping
    project: undefined,
    exclude: [],
    targets: [],
    minSize: undefined,
    minAge: undefined,
    maxAge: undefined,
    provider: 'local',
    region: undefined,
    awsProfile: undefined,
    gcpProject: undefined,
    tags: [],
    withCost: false,
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

  it('reports a protected match as a diagnostic instead of an entry, and says so on stderr', async () => {
    root = buildTree({ dist: { vendored: { '.git': {} } }, node_modules: { f: 'x' } });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, json: true }), io);
    expect(code).toBe(0);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries.map((e: { ruleName: string }) => e.ruleName)).toEqual(['node_modules']);
    expect(payload.diagnostics).toEqual([
      expect.objectContaining({
        code: 'protected',
        reason: 'nested-repository',
        relativePath: 'dist',
      }),
    ]);
    expect(io.err).toEqual([
      "protected: dist matches 'dist' but contains its own .git repository; not offered for deletion",
    ]);
  });

  it('drops protected matches that --exclude already removes', async () => {
    root = buildTree({ dist: { '.git': {} } });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, json: true, exclude: ['dist'] }), io);
    expect(JSON.parse(io.out.join('')).diagnostics).toEqual([]);
  });

  it('marks entries inside iCloud Drive or File Provider folders as cloudSynced', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, json: true }), io);
    expect(JSON.parse(io.out.join('')).entries[0].cloudSynced).toBe(false);
    expect(
      isCloudSynced('/Users/me/Library/CloudStorage/Dropbox/app/node_modules', '/Users/me'),
    ).toBe(true);
    expect(isCloudSynced('/Users/me/Library/Mobile Documents', '/Users/me')).toBe(true);
    expect(isCloudSynced('/Users/me/Library/CloudStorageX/node_modules', '/Users/me')).toBe(false);
    expect(isCloudSynced('/Users/me/dev/node_modules', '/Users/me')).toBe(false);
  });

  it('hides zero-byte artifacts unless --include-empty', async () => {
    root = buildTree({ node_modules: null, dist: { 'a.js': 'x' } });
    const hidden = captureIO();
    await runHeadless(baseArgs({ directory: root, json: true }), hidden);
    const names = (io: { out: string[] }) =>
      JSON.parse(io.out.join(''))
        .entries.map((e: { ruleName: string }) => e.ruleName)
        .sort();
    expect(names(hidden)).toEqual(['dist']);
    const shown = captureIO();
    await runHeadless(baseArgs({ directory: root, json: true, includeEmpty: true }), shown);
    expect(names(shown)).toEqual(['dist', 'node_modules']);
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

  it('rejects an invalid --min-age string with exit code 2', async () => {
    root = buildTree({});
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, minAge: 'not-a-duration' }), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid duration/);
  });

  it('rejects an invalid --max-age string with exit code 2', async () => {
    root = buildTree({});
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, maxAge: 'not-a-duration' }), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid duration/);
  });

  it('filters out freshly modified matches below --min-age', async () => {
    root = buildTree({ node_modules: null });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, minAge: '1d' }), io);
    expect(code).toBe(1);
    expect(io.out).toContain('Nothing to clean.');
  });

  it('keeps a match older than --min-age and reports its lastModified in JSON', async () => {
    root = buildTree({ node_modules: null });
    const old = new Date(Date.now() - 2 * 86_400_000);
    utimesSync(join(root, 'node_modules'), old, old);
    const io = captureIO();
    const code = await runHeadless(
      baseArgs({ directory: root, includeEmpty: true, minAge: '1d', json: true }),
      io,
    );
    expect(code).toBe(0);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].lastModified).toBeTypeOf('number');
  });

  it('--min-age also drops a match whose own mtime is old but whose contents changed recently', async () => {
    root = buildTree({ node_modules: { pkg: { 'index.js': 'x' } }, dist: { 'a.js': 'x' } });
    backdate(join(root, 'dist'));
    const old = new Date(Date.now() - 2 * 86_400_000);
    utimesSync(join(root, 'node_modules'), old, old);
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, minAge: '1d', json: true }), io);
    const names = JSON.parse(io.out.join('')).entries.map((e: { ruleName: string }) => e.ruleName);
    expect(names).toEqual(['dist']);
  });

  it('--min-age 0 keeps fresh matches and lets --delete remove them', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const io = captureIO();
    const code = await runHeadless(
      baseArgs({ directory: root, minAge: '0', delete: true, yes: true }),
      io,
    );
    expect(code).toBe(0);
    expect(existsSync(join(root, 'node_modules'))).toBe(false);
  });

  it('--delete skips a recently active artifact by default and exits 1', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, delete: true, yes: true }), io);
    expect(code).toBe(1);
    expect(existsSync(join(root, 'node_modules'))).toBe(true);
    expect(io.err.some((l) => l.includes('skipped: modified within the last 1w'))).toBe(true);
  });

  it('filters out a match older than --max-age', async () => {
    root = buildTree({ node_modules: null });
    const old = new Date(Date.now() - 2 * 86_400_000);
    utimesSync(join(root, 'node_modules'), old, old);
    const io = captureIO();
    const code = await runHeadless(baseArgs({ directory: root, maxAge: '1d' }), io);
    expect(code).toBe(1);
    expect(io.out).toContain('Nothing to clean.');
  });

  it('excludes matches via --exclude glob', async () => {
    root = buildTree({ keep: { node_modules: null }, skip: { node_modules: null } });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, includeEmpty: true, exclude: ['skip/*'] }), io);
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines.some((l) => l.includes(join('keep', 'node_modules')))).toBe(true);
    expect(lines.some((l) => l.includes(join('skip', 'node_modules')))).toBe(false);
  });

  it('restricts matching via --targets (literal name)', async () => {
    root = buildTree({ node_modules: null, dist: null });
    const io = captureIO();
    await runHeadless(baseArgs({ directory: root, includeEmpty: true, targets: ['dist'] }), io);
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
    await runHeadless(
      baseArgs({ directory: root, includeEmpty: true, sort: 'name', ascending: true }),
      io,
    );
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines[0]).toContain('dist');
  });

  it('sorts by path', async () => {
    root = buildTree({ a: { node_modules: null }, b: { node_modules: null } });
    const io = captureIO();
    await runHeadless(
      baseArgs({ directory: root, includeEmpty: true, sort: 'path', ascending: true }),
      io,
    );
    const lines = io.out.filter((l) => l.includes(root));
    expect(lines[0]).toContain(join('a', 'node_modules'));
  });

  it('--delete with --yes deletes without prompting', async () => {
    root = buildTree({ node_modules: { f: 'x' } });
    backdate(root);
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
    backdate(root);
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
    backdate(root);
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
    backdate(root);
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

  it('scans several roots, reporting each entry once with its own root', async () => {
    root = buildTree({
      a: { app: { dist: { 'x.js': 'x' } } },
      b: { lib: { node_modules: { f: 'x' } } },
    });
    const io = captureIO();
    const code = await runHeadless(
      baseArgs({
        directories: [join(root, 'a'), join(root, 'b'), join(root, 'a', 'app')],
        full: false,
        json: true,
      }),
      io,
    );
    expect(code).toBe(0);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.roots).toEqual([join(root, 'a'), join(root, 'b'), join(root, 'a', 'app')]);
    expect(payload.root).toBe(join(root, 'a'));
    const entries = payload.entries.map((e: { root: string; relativePath: string }) => [
      e.root,
      e.relativePath,
    ]);
    expect(entries.sort()).toEqual([
      [join(root, 'a'), 'app/dist'],
      [join(root, 'b'), 'lib/node_modules'],
    ]);
  });

  it('prints ~-relative paths in the table when scanning several roots', async () => {
    root = buildTree({ a: { dist: { 'x.js': 'x' } }, b: { dist: { 'y.js': 'y' } } });
    const saved = process.env.HOME;
    process.env.HOME = root;
    try {
      const io = captureIO();
      await runHeadless(
        baseArgs({ directories: [join(root, 'a'), join(root, 'b')], richOutput: true }),
        io,
      );
      expect(io.out[0]).toBe('Scan: ~/a, ~/b');
      expect(io.out.filter((l) => l.endsWith('~/a/dist') || l.endsWith('~/b/dist'))).toHaveLength(
        2,
      );
    } finally {
      process.env.HOME = saved;
    }
  });

  it('--discover scans the discovered home roots', async () => {
    root = buildTree({ dev: { app: { dist: { 'x.js': 'x' } } }, Documents: { 'a.txt': 'x' } });
    const saved = process.env.HOME;
    process.env.HOME = root;
    try {
      const io = captureIO();
      await runHeadless(baseArgs({ directories: [], discover: true, full: false, json: true }), io);
      const payload = JSON.parse(io.out.join(''));
      expect(payload.roots).toEqual([join(root, 'dev')]);
      expect(payload.entries.map((e: { relativePath: string }) => e.relativePath)).toEqual([
        'app/dist',
      ]);
    } finally {
      process.env.HOME = saved;
    }
  });

  it('reports an empty scan of several roots with the root list', async () => {
    root = buildTree({ a: {}, b: {} });
    const io = captureIO();
    const code = await runHeadless(
      baseArgs({ directories: [join(root, 'a'), join(root, 'b')], emptyIsSuccess: true }),
      io,
    );
    expect(code).toBe(0);
    expect(io.out).toEqual([`No artifacts found under ${join(root, 'a')}, ${join(root, 'b')}.`]);
  });

  it('abbreviates only paths inside the home directory', () => {
    expect(tildify('/Users/me/dev/app', '/Users/me')).toBe('~/dev/app');
    expect(tildify('/Users/me', '/Users/me')).toBe('~');
    expect(tildify('/Users/meta/app', '/Users/me')).toBe('/Users/meta/app');
  });
});
