import { afterEach, describe, expect, it, vi } from 'vitest';

const runTuiMock = vi.fn();
vi.mock('../ui/run-tui.js', () => ({ runTui: runTuiMock }));

const { runCli } = await import('./cli.js');

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
});
