import { afterEach, describe, expect, it, vi } from 'vitest';

const runCliMock = vi.fn();
vi.mock('./cli.js', () => ({ runCli: runCliMock }));

describe('cli-main (bin entry)', () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.removeAllListeners('SIGINT');
    vi.resetModules();
    runCliMock.mockReset();
  });

  it('forwards argv, wires SIGINT to abort, and sets process.exitCode', async () => {
    process.argv = ['node', 'purgeit', '--full', '--json'];

    let seenArgv: string[] | undefined;
    runCliMock.mockImplementation(async (argv: string[], opts: { signal: AbortSignal }) => {
      seenArgv = argv;
      expect(opts.signal.aborted).toBe(false);
      process.emit('SIGINT');
      expect(opts.signal.aborted).toBe(true);
      return 3;
    });

    await import('./cli-main.js');

    expect(seenArgv).toEqual(['--full', '--json']);
    expect(runCliMock).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(3);
  });

  it('force-quits with exit code 130 on a second SIGINT', async () => {
    process.argv = ['node', 'purgeit'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    runCliMock.mockImplementation(async () => {
      process.emit('SIGINT');
      process.emit('SIGINT');
      return 0;
    });

    await import('./cli-main.js');

    expect(exitSpy).toHaveBeenCalledExactlyOnceWith(130);
    exitSpy.mockRestore();
  });
});
