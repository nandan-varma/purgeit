import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';

const runTuiMock = vi.fn();
vi.mock('../ui/run-tui.js', () => ({ runTui: runTuiMock }));

const runHeadlessCloudMock = vi.fn();
vi.mock('./headless-cloud.js', () => ({ runHeadlessCloud: runHeadlessCloudMock }));

const runSkillsCommandMock = vi.fn();
vi.mock('./skills.js', () => ({ runSkillsCommand: runSkillsCommandMock }));

// vi.spyOn can't redefine a live ESM namespace export, so readFile is
// wrapped as a mock at module-load time instead — see the failing-readFile
// test below, which is the only one that overrides its behavior.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const { runCli } = await import('./cli.js');

// Headless runs below really scan (and one really deletes), so they must never
// point at a shared directory like /tmp — whatever artifacts other processes
// left there would be listed or removed. An empty private tree has nothing to find.
const EMPTY_ROOT = buildTree({}, 'purgeit-cli-empty-');
afterAll(() => cleanupTree(EMPTY_ROOT));
const fsPromises = await import('node:fs/promises');

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

describe('runCli', () => {
  afterEach(() => {
    runTuiMock.mockReset();
    runHeadlessCloudMock.mockReset();
    runSkillsCommandMock.mockReset();
  });

  it('--help prints USAGE and returns 0', async () => {
    const io = captureIO();
    const code = await runCli(['--help'], io);
    expect(code).toBe(0);
    expect(io.out[0]).toContain('Usage: purgeit');
  });

  it('-h prints USAGE and returns 0', async () => {
    const io = captureIO();
    const code = await runCli(['-h'], io);
    expect(code).toBe(0);
    expect(io.out[0]).toContain('Usage: purgeit');
  });

  it('--version prints the version and returns 0', async () => {
    const io = captureIO();
    const code = await runCli(['--version'], io);
    expect(code).toBe(0);
    expect(io.out[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('prints error + USAGE on bad args and returns 2', async () => {
    const io = captureIO();
    const code = await runCli(['--bogus'], io);
    expect(code).toBe(2);
    expect(io.err.some((l) => l.includes('purgeit:'))).toBe(true);
    expect(io.err.some((l) => l.includes('Usage:'))).toBe(true);
  });

  it('apply requires --plan <file>', async () => {
    const io = captureIO();
    expect(await runCli(['apply'], io)).toBe(2);
    expect(await runCli(['apply', '--plan', '--yes'], io)).toBe(2);
    expect(io.err).toEqual([
      'purgeit: apply requires --plan <file>',
      'purgeit: apply requires --plan <file>',
    ]);
  });

  it('apply rejects an invalid --min-age', async () => {
    const io = captureIO();
    expect(await runCli(['apply', '--plan', 'p.json', '--min-age', 'soon'], io)).toBe(2);
    expect(io.err[0]).toMatch(/invalid duration/);
  });

  it('apply --min-age 0 lifts the recency guard for a fresh approved artifact', async () => {
    const root = buildTree({ node_modules: { f: 'x' } });
    try {
      const plan = {
        schemaVersion: 1,
        root,
        entries: [
          {
            path: join(root, 'node_modules'),
            relativePath: 'node_modules',
            ruleName: 'node_modules',
            lastModified: null,
          },
        ],
      };
      writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
      const io = captureIO();
      const code = await runCli(['apply', '--plan', 'plan.json', '--yes', '--min-age', '0'], {
        ...io,
        cwd: root,
      });
      expect(code).toBe(0);
      expect(existsSync(join(root, 'node_modules'))).toBe(false);
    } finally {
      cleanupTree(root);
    }
  });

  it('refuses to open the TUI on several directories or --discover', async () => {
    for (const argv of [
      ['tui', 'a', 'b'],
      ['tui', '--discover'],
    ]) {
      const io = captureIO();
      expect(await runCli(argv, io)).toBe(2);
      expect(io.err[0]).toMatch(/one directory at a time/);
    }
    expect(runTuiMock).not.toHaveBeenCalled();
  });

  it('hides zero-byte artifacts in the TUI unless --include-empty', async () => {
    runTuiMock.mockResolvedValue(0);
    await runCli(['--tui', '.'], { cwd: EMPTY_ROOT });
    expect(runTuiMock).toHaveBeenLastCalledWith(expect.objectContaining({ minSizeBytes: 1 }));
    await runCli(['--tui', '--include-empty', '.'], { cwd: EMPTY_ROOT });
    expect(runTuiMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ minSizeBytes: undefined }),
    );
  });

  it('dispatches docs to its own command', async () => {
    const io = captureIO();
    expect(await runCli(['docs', 'nope'], io)).toBe(2);
    expect(io.err[0]).toMatch(/unknown docs topic 'nope'/);
  });

  it('dispatches history to its own command', async () => {
    const io = captureIO();
    expect(await runCli(['history', '--help'], io)).toBe(0);
    expect(io.out[0]).toMatch(/^Usage: purgeit history/);
  });

  it('runs headless when --json is passed', async () => {
    const io = captureIO();
    const code = await runCli(['--json', '--headless', '.'], { ...io, cwd: EMPTY_ROOT });
    expect(code).toBe(1);
  });

  it('runs headless when --delete is passed with --yes', async () => {
    const io = captureIO();
    const code = await runCli(['--delete', '--yes', '.'], { ...io, cwd: EMPTY_ROOT });
    expect(code).toBe(1);
  });

  it('runs headless when --headless is passed', async () => {
    const io = captureIO();
    const code = await runCli(['--headless', '.'], { ...io, cwd: EMPTY_ROOT });
    expect(code).toBe(1);
  });

  it('launches TUI when --tui is passed', async () => {
    runTuiMock.mockResolvedValue(0);
    const io = captureIO();
    const code = await runCli(['--tui', '.'], { ...io, cwd: '/tmp' });
    expect(code).toBe(0);
    expect(runTuiMock).toHaveBeenCalledOnce();
  });

  it('accepts a positional directory argument', async () => {
    const io = captureIO();
    const code = await runCli(['--headless', EMPTY_ROOT], io);
    expect(code).toBe(1);
  });

  it('accepts -d for directory', async () => {
    const io = captureIO();
    const code = await runCli(['--headless', '-d', EMPTY_ROOT], io);
    expect(code).toBe(1);
  });

  it('--version returns "0.0.0" when both package.json candidates are unreadable', async () => {
    const io = captureIO();
    // Both readOwnVersion() candidates get one rejection each.
    vi.mocked(fsPromises.readFile)
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockRejectedValueOnce(new Error('ENOENT'));
    const code = await runCli(['--version'], io);
    expect(code).toBe(0);
    expect(io.out[0]).toBe('0.0.0');
  });

  it('launches TUI when stdout is a TTY and no mode flag forces headless', async () => {
    runTuiMock.mockResolvedValue(0);
    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      // Also covers the io.cwd/parsed.full default branches: no cwd override
      // and no --full, so cli.ts falls back to process.cwd() and 'projects'.
      const code = await runCli(['--directory', '/tmp'], {});
      expect(code).toBe(0);
      expect(runTuiMock).toHaveBeenCalledOnce();
    } finally {
      if (isTTYDescriptor) {
        Object.defineProperty(process.stdout, 'isTTY', isTTYDescriptor);
      }
    }
  });

  it('passes flat mode through to the TUI scan options when --full is given', async () => {
    runTuiMock.mockResolvedValue(0);
    const code = await runCli(['--tui', '--full', '/tmp'], {});
    expect(code).toBe(0);
    expect(runTuiMock).toHaveBeenCalledWith(
      expect.objectContaining({ scanOpts: expect.objectContaining({ mode: 'flat' }) }),
    );
  });

  it('forwards config/filter/sort/dry-run flags through to the TUI', async () => {
    runTuiMock.mockResolvedValue(0);
    const io = captureIO();
    const code = await runCli(
      [
        '--tui',
        '--config',
        './purgeit.config.json',
        '--no-gated',
        '--targets',
        'node_modules,dist',
        '--exclude',
        'skip/*',
        '--min-size',
        '10MB',
        '--sort',
        'name',
        '--asc',
        '--dry-run',
        '/tmp',
      ],
      { ...io, cwd: '/tmp' },
    );
    expect(code).toBe(0);
    expect(runTuiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: './purgeit.config.json',
        noConfig: false,
        noGated: true,
        targets: ['node_modules', 'dist'],
        exclude: ['skip/*'],
        minSizeBytes: 10 * 1024 * 1024,
        sort: 'name',
        ascending: true,
        dryRun: true,
      }),
    );
  });

  it('rejects an invalid --min-size before launching the TUI, without calling runTui', async () => {
    const io = captureIO();
    const code = await runCli(['--tui', '--min-size', 'not-a-size', '/tmp'], {
      ...io,
      cwd: '/tmp',
    });
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid size/);
    expect(runTuiMock).not.toHaveBeenCalled();
  });

  it('forwards --min-age/--max-age through to the TUI as milliseconds', async () => {
    runTuiMock.mockResolvedValue(0);
    const code = await runCli(['--tui', '--min-age', '1d', '--max-age', '30d', '/tmp'], {});
    expect(code).toBe(0);
    expect(runTuiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        minAgeMs: 86_400_000,
        maxAgeMs: 30 * 86_400_000,
      }),
    );
  });

  it('rejects an invalid --min-age before launching the TUI, without calling runTui', async () => {
    const io = captureIO();
    const code = await runCli(['--tui', '--min-age', 'not-a-duration', '/tmp'], {
      ...io,
      cwd: '/tmp',
    });
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid duration/);
    expect(runTuiMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid --max-age before launching the TUI, without calling runTui', async () => {
    const io = captureIO();
    const code = await runCli(['--tui', '--max-age', 'not-a-duration', '/tmp'], {
      ...io,
      cwd: '/tmp',
    });
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid duration/);
    expect(runTuiMock).not.toHaveBeenCalled();
  });

  it('uses process.stdout/stderr when io is not provided', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const helpCode = await runCli(['--help']);
      expect(helpCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalled();

      const badArgsCode = await runCli(['--bogus']);
      expect(badArgsCode).toBe(2);
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('returns exit code 2 when the TUI throws a config error', async () => {
    runTuiMock.mockRejectedValue(new Error('config error: bad config'));
    const io = captureIO();
    const code = await runCli(['--tui', '/tmp'], { ...io, cwd: '/tmp' });
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/config error: bad config/);
  });

  it('dispatches to runHeadlessCloud (never the TUI) for --provider aws|gcp, even in a TTY', async () => {
    runHeadlessCloudMock.mockResolvedValue(0);
    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      const code = await runCli(['--provider', 'aws', '--tag', 'env=dev']);
      expect(code).toBe(0);
      expect(runHeadlessCloudMock).toHaveBeenCalledOnce();
      expect(runTuiMock).not.toHaveBeenCalled();
    } finally {
      if (isTTYDescriptor) Object.defineProperty(process.stdout, 'isTTY', isTTYDescriptor);
    }
  });

  it('dispatches "skills" to runSkillsCommand before any flag parsing, never the TUI/headless paths', async () => {
    runSkillsCommandMock.mockResolvedValue(0);
    const code = await runCli(['skills', 'get', 'core']);
    expect(code).toBe(0);
    expect(runSkillsCommandMock).toHaveBeenCalledWith(
      ['get', 'core'],
      expect.objectContaining({ stdout: expect.any(Function), stderr: expect.any(Function) }),
    );
    expect(runTuiMock).not.toHaveBeenCalled();
    expect(runHeadlessCloudMock).not.toHaveBeenCalled();
  });
});
