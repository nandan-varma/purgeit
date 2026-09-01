import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatErrorMessage, parseDuration, parseSizeString } from '../format.js';
import { runAgentCommand } from './agent.js';
import { parseCliArgs, USAGE } from './args.js';
import { USAGE as COMMAND_USAGE } from './guide.js';
import { runHeadless } from './headless.js';
import { runHeadlessCloud } from './headless-cloud.js';
import { applyPlan, writePlan } from './plans.js';
import { runSkillsCommand } from './skills.js';

export interface CliIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  cwd?: string;
  signal?: AbortSignal | undefined;
}

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));

  // Checked before parseCliArgs so 'skills' is never mistaken for a
  // directory positional — a subcommand, not a flag, so it lives outside
  // the rest of the flag-based parsing surface entirely.
  if (argv[0] === 'agent') {
    return runAgentCommand(argv.slice(1), { stdout, stderr });
  }
  if (argv[0] === 'apply') {
    const planIndex = argv.indexOf('--plan');
    const planFile = planIndex === -1 ? undefined : argv[planIndex + 1];
    if (planFile === undefined || planFile.startsWith('-')) {
      stderr('purgeit: apply requires --plan <file>');
      return 2;
    }
    return applyPlan(planFile, argv.includes('--yes'), {
      stdout,
      stderr,
      cwd: io.cwd,
      signal: io.signal,
    });
  }
  if (argv[0] === 'skills') {
    return runSkillsCommand(argv.slice(1), { stdout, stderr });
  }

  const isPlanCommand = argv[0] === 'plan';
  const isScanCommand = argv[0] === 'scan';
  if (argv[0] === 'scan' || argv[0] === 'tui' || isPlanCommand) {
    const command = argv[0];
    argv = argv.slice(1);
    if (command === 'scan') {
      argv = ['--headless', ...argv];
      if (
        !argv.some((arg) => arg === '--format' || arg.startsWith('--format=')) &&
        !argv.includes('--json')
      ) {
        argv = [...argv, '--format', process.stdout.isTTY ? 'table' : 'json'];
      }
    } else if (command === 'tui') {
      argv = ['--tui', ...argv];
    }
  }

  let parsed: Awaited<ReturnType<typeof parseCliArgs>>;
  try {
    const early = parseCliArgs(argv);
    if (early === 'help') {
      stdout(`${COMMAND_USAGE}\n\n${USAGE}`);
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

  if (isScanCommand) parsed = { ...parsed, emptyIsSuccess: true, richOutput: true };

  if (isPlanCommand) {
    if ((parsed.include?.length ?? 0) === 0 || parsed.output === undefined) {
      stderr('purgeit: plan requires at least one --include <relative-path> and --output <file>');
      return 2;
    }
    const captured: string[] = [];
    const code = await runHeadless(
      { ...parsed, headless: true, json: true, format: 'json', delete: false },
      { stdout: (line) => captured.push(line), stderr, cwd: io.cwd, signal: io.signal },
    );
    if (code !== 0) return code;
    try {
      const report = JSON.parse(captured.join('')) as {
        root: string;
        entries: {
          path: string;
          relativePath: string;
          ruleName: string;
          lastModified: number | null;
        }[];
      };
      return writePlan(report, parsed.output, { stdout, stderr, cwd: io.cwd, signal: io.signal });
    } catch (err) {
      stderr(`purgeit: failed to create plan: ${formatErrorMessage(err)}`);
      return 2;
    }
  }

  // Cloud scanning is headless-only this release — the interactive TUI's
  // data model is local-filesystem-specific (see ui/state.ts), so --provider
  // aws|gcp always takes the non-interactive report/confirm/delete path,
  // even in a TTY.
  const wantsTui =
    parsed.provider === 'local' &&
    (parsed.tui ||
      (!parsed.headless && !parsed.json && !parsed.delete && Boolean(process.stdout.isTTY)));

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

    let minAgeMs: number | undefined;
    let maxAgeMs: number | undefined;
    try {
      if (parsed.minAge !== undefined) minAgeMs = parseDuration(parsed.minAge);
      if (parsed.maxAge !== undefined) maxAgeMs = parseDuration(parsed.maxAge);
    } catch (err) {
      stderr(`purgeit: ${formatErrorMessage(err)}`);
      return 2;
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
        minAgeMs,
        maxAgeMs,
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

  return parsed.provider === 'local'
    ? runHeadless(parsed, headlessOpts)
    : runHeadlessCloud(parsed, headlessOpts);
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
