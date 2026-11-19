import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';
import { PurgeitError } from '../errors.js';
import type { CleanCommandFlags } from './commands/clean.js';
import type { RulesFlags } from './commands/rules.js';
import type { ScanCommandFlags } from './commands/scan.js';
import type { CliEnv } from './env.js';
import { type ScanFlags, scanOptions } from './flags.js';

declare const __VERSION__: string | undefined;

const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';

const format = (...choices: string[]): Option =>
  new Option('--format <format>', 'output format').choices(choices).default(choices[0]);

function createProgram(env: CliEnv, setExit: (code: number) => void): Command {
  const program = new Command('purgeit')
    .description('Find and safely delete regenerable dev build artifacts.')
    .version(VERSION)
    .showHelpAfterError('(run with --help for usage)')
    .exitOverride()
    .configureOutput({
      writeOut: (text) => env.out(text.trimEnd()),
      writeErr: (text) => env.err(text.trimEnd()),
    });

  const withScanOptions = (command: Command, minAgeHint: string): Command => {
    for (const option of scanOptions(minAgeHint)) command.addOption(option);
    return command;
  };

  withScanOptions(
    program
      .command('browse [dirs...]', { isDefault: true })
      .alias('tui')
      .description('browse and select artifacts to delete in an interactive terminal UI (default)'),
    'Nothing is ever refused in the UI unless you set this.',
  ).action(async (dirs: string[], flags: ScanFlags) => {
    if (!env.interactive) {
      throw new PurgeitError(
        'The interactive UI needs a terminal. Use `purgeit scan` to list or `purgeit clean` to delete.',
      );
    }
    const { resolveScan } = await import('./options.js');
    const resolved = await resolveScan(dirs, flags, env, '0');
    const { runTui } = await import('../tui/run.js');
    setExit(await runTui(resolved, env));
  });

  withScanOptions(
    program.command('scan [dirs...]').description('list artifacts without deleting anything'),
    'Default: 0.',
  )
    .addOption(format('text', 'json', 'ndjson'))
    .action(async (dirs: string[], flags: ScanCommandFlags) => {
      setExit(await (await import('./commands/scan.js')).runScan(dirs, flags, env));
    });

  withScanOptions(
    program
      .command('clean [dirs...]')
      .description('delete artifacts, re-verifying each one at the moment of deletion'),
    'Also the window nothing recently active is deleted within. Default: 7d.',
  )
    .option('--plan <file>', 'delete exactly what a reviewed `scan --format json` report lists')
    .option('-y, --yes', 'do not ask for confirmation', false)
    .option('-n, --dry-run', 'run every check but delete nothing', false)
    .addOption(format('text', 'json'))
    .action(async (dirs: string[], flags: CleanCommandFlags) => {
      setExit(await (await import('./commands/clean.js')).runClean(dirs, flags, env));
    });

  program
    .command('rules')
    .description('list the rules in effect')
    .option('--category <id>', 'only this ecosystem, e.g. rust')
    .option(
      '--only <rules>',
      'only these rules',
      (value: string, prev: string[]) => [...prev, ...value.split(',')],
      [] as string[],
    )
    .option('--safe-only', 'only rules that need no proof', false)
    .option('--config <file>', 'use this config file')
    .option('--no-config', 'ignore any config file')
    .addOption(format('text', 'json'))
    .action(async (flags: RulesFlags) => {
      setExit(await (await import('./commands/rules.js')).runRules(flags, env));
    });

  program
    .command('history')
    .description('show what purgeit has deleted, newest first')
    .option(
      '-n, --limit <count>',
      'how many records to show',
      (value: string) => {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1)
          throw new InvalidArgumentError('must be a positive integer');
        return count;
      },
      20,
    )
    .addOption(format('text', 'json'))
    .action(async (flags: { limit: number; format: 'text' | 'json' }) => {
      setExit(await (await import('./commands/history.js')).runHistory(flags, env));
    });

  program
    .command('skill')
    .description('print the guide for AI agents that drive purgeit')
    .action(async () => {
      setExit((await import('./commands/skill.js')).runSkill(env));
    });

  return program;
}

/** Runs the CLI in-process and returns its exit code; never exits or throws for user errors. */
export async function run(argv: readonly string[], env: CliEnv): Promise<number> {
  let code = 0;
  try {
    await createProgram(env, (next) => {
      code = next;
    }).parseAsync([...argv], { from: 'user' });
    return env.signal?.aborted ? 130 : code;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.code === 'commander.helpDisplayed' ||
        error.code === 'commander.version' ||
        error.code === 'commander.help'
        ? 0
        : 2;
    }
    if (error instanceof PurgeitError) {
      env.err(`purgeit: ${error.message}`);
      return 2;
    }
    throw error;
  }
}
