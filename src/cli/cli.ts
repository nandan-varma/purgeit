import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseCliArgs, USAGE } from './args.js';
import { runHeadless } from './headless.js';

export interface CliIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  cwd?: string;
  signal?: AbortSignal | undefined;
}

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));

  let parsed: Awaited<ReturnType<typeof parseCliArgs>>;
  try {
    const early = parseCliArgs(argv);
    if (early === 'help') {
      stdout(USAGE);
      return 0;
    }
    if (early === 'version') {
      stdout(await readOwnVersion());
      return 0;
    }
    parsed = early;
  } catch (err) {
    stderr(`purgeit: ${(err as Error).message}`);
    stderr(`\n${USAGE}`);
    return 2;
  }

  const wantsTui =
    parsed.tui ||
    (!parsed.headless && !parsed.json && !parsed.delete && Boolean(process.stdout.isTTY));

  if (wantsTui) {
    const { runTui } = await import('../ui/run-tui.js');
    const cwd = io.cwd ?? process.cwd();
    const root = resolve(cwd, parsed.directory);
    return runTui({
      root,
      signal: io.signal,
      scanOpts: {
        mode: parsed.full ? 'flat' : 'projects',
        targetProject: parsed.project,
        concurrency: parsed.concurrency,
        maxDepth: parsed.depth,
      },
    });
  }

  const headlessOpts = {
    stdout,
    stderr,
    ...(io.cwd !== undefined && { cwd: io.cwd }),
    signal: io.signal,
  };

  return runHeadless(parsed, headlessOpts);
}

async function readOwnVersion(): Promise<string> {
  const candidates = [
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
  ];
  for (const url of candidates) {
    try {
      const raw = await readFile(url, 'utf-8');
      return (JSON.parse(raw) as { version: string }).version;
    } catch {
      // try next
    }
  }
  return '0.0.0';
}
