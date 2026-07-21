import { afterEach, describe, expect, it, vi } from 'vitest';

const runTuiMock = vi.fn();
vi.mock('../ui/run-tui.js', () => ({ runTui: runTuiMock }));

// vi.spyOn can't redefine a live ESM namespace export, so readFile is
// wrapped as a mock at module-load time instead — see the failing-readFile
// test below, which is the only one that overrides its behavior.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const { runCli } = await import('./cli.js');
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

  it('runs headless when --json is passed', async () => {
    const io = captureIO();
    const code = await runCli(['--json', '--headless', '.'], { ...io, cwd: '/tmp' });
    expect(code).toBe(1);
  });

  it('runs headless when --delete is passed with --yes', async () => {
    const io = captureIO();
    const code = await runCli(['--delete', '--yes', '.'], { ...io, cwd: '/tmp' });
    expect(code).toBe(1);
  });

  it('runs headless when --headless is passed', async () => {
    const io = captureIO();
    const code = await runCli(['--headless', '.'], { ...io, cwd: '/tmp' });
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
    const code = await runCli(['--headless', '/tmp'], io);
    expect(code).toBe(1);
  });

  it('accepts -d for directory', async () => {
    const io = captureIO();
    const code = await runCli(['--headless', '-d', '/tmp'], io);
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
});
