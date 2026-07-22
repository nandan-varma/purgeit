import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatErrorMessage, parseSizeString } from '../format.js';
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
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    stderr(`\n${USAGE}`);
    return 2;
  }

  const wantsTui =
    parsed.tui ||
    (!parsed.headless && !parsed.json && !parsed.delete && Boolean(process.stdout.isTTY));

  if (wantsTui) {
    let minSizeBytes: number | undefined;
    if (parsed.minSize !== undefined) {
      try {
        minSizeBytes = parseSizeString(parsed.minSize);
      } catch (err) {
        stderr(`purgeit: ${formatErrorMessage(err)}`);
        return 2;
      }
    }

    const { runTui } = await import('../ui/run-tui.js');
    const cwd = io.cwd ?? process.cwd();
    const root = resolve(cwd, parsed.directory);
    try {
      return await runTui({
        root,
        signal: io.signal,
        scanOpts: {
          mode: parsed.full ? 'flat' : 'projects',
          targetProject: parsed.project,
          concurrency: parsed.concurrency,
          maxDepth: parsed.depth,
        },
        configPath: parsed.configPath,
        noConfig: parsed.noConfig,
        noGated: parsed.noGated,
        targets: parsed.targets,
        exclude: parsed.exclude,
        minSizeBytes,
        sort: parsed.sort,
        ascending: parsed.ascending,
        dryRun: parsed.dryRun,
      });
    } catch (err) {
      stderr(`purgeit: ${formatErrorMessage(err)}`);
      return 2;
    }
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
