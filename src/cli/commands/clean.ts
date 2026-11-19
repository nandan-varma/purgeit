import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { styleText } from 'node:util';

import { clean, type CleanSummary, type Target } from '../../clean/clean.js';
import { PurgeitError } from '../../errors.js';
import { scanAll } from '../../scan/scan.js';
import { formatSize, parseDuration } from '../../units.js';
import type { CliEnv } from '../env.js';
import { DEFAULT_MIN_AGE, type ScanFlags } from '../flags.js';
import { resolveRules, resolveScan } from '../options.js';
import { tildify } from '../render.js';
import { parsePlan } from '../report.js';

export interface CleanCommandFlags extends ScanFlags {
  plan?: string;
  yes: boolean;
  dryRun: boolean;
  format: 'text' | 'json';
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What a clean run produced, in the shapes both output formats need. */
interface CleanOutcome {
  readonly deleted: { path: string; bytes: number }[];
  readonly refused: { path: string; code: string; message: string }[];
  readonly failed: { path: string; message: string }[];
  readonly summary: CleanSummary;
  /** A Ctrl+C mid-run skips the rest: never present that as a completed clean. */
  readonly interrupted: boolean;
  /** Targets no event accounted for — skipped because the run was interrupted. */
  readonly left: number;
}

/** Prints the outcome in the requested format and returns the exit code. */
function reportRun(flags: CleanCommandFlags, env: CliEnv, outcome: CleanOutcome): number {
  const { summary, interrupted, left } = outcome;
  if (flags.format === 'text') {
    const head = flags.dryRun
      ? `Dry run: would delete ${plural(summary.deleted, 'artifact')}, freeing ${formatSize(summary.bytes)}`
      : `Deleted ${plural(summary.deleted, 'artifact')}, freed ${formatSize(summary.bytes)}`;
    const rest = [
      summary.refused > 0 ? `${summary.refused} skipped` : '',
      summary.failed > 0 ? `${summary.failed} failed` : '',
    ].filter(Boolean);
    env.out(rest.length === 0 ? head : `${head} (${rest.join(', ')})`);
    if (interrupted && left > 0) {
      env.out(styleText('yellow', `Interrupted — ${plural(left, 'artifact')} left unprocessed.`));
    }
  } else {
    env.out(
      JSON.stringify(
        {
          dryRun: flags.dryRun,
          ...outcome,
          summary,
          interrupted,
          left,
        },
        null,
        2,
      ),
    );
  }
  if (interrupted) return 130;
  return summary.refused > 0 || summary.failed > 0 ? 1 : 0;
}

/** Finds artifacts (or reads a reviewed plan) and deletes them. Every path is
 * re-verified at the moment of deletion, and anything touched within
 * `--min-age` (7 days unless configured) is left alone.
 */
export async function runClean(
  dirs: readonly string[],
  flags: CleanCommandFlags,
  env: CliEnv,
): Promise<number> {
  if (flags.format === 'json' && !flags.yes && !flags.dryRun) {
    throw new PurgeitError('--format json cannot ask for confirmation: pass --yes or --dry-run.');
  }

  let roots: string[];
  let targets: Target[];
  let rules: Awaited<ReturnType<typeof resolveRules>>['rules'];
  let idleFor: number;

  if (flags.plan !== undefined) {
    if (dirs.length > 0 || flags.discover) {
      throw new PurgeitError(
        '--plan carries its own roots: do not pass directories or --discover.',
      );
    }
    const file = resolve(env.cwd, flags.plan);
    const plan = parsePlan(
      await readFile(file, 'utf8').catch((error: Error) => {
        throw new PurgeitError(`Cannot read plan ${file}: ${error.message}`);
      }),
      file,
    );
    const resolvedRules = await resolveRules(flags, env);
    rules = resolvedRules.rules;
    idleFor = parseDuration(flags.minAge ?? resolvedRules.config.minAge ?? DEFAULT_MIN_AGE);
    roots = plan.roots.map((root) => resolve(env.cwd, root));
    targets = plan.entries
      .filter((entry) => !entry.protection)
      .map((entry) => ({
        path: entry.path,
        bytes: entry.bytes,
        unchangedSince: entry.lastActive,
      }));
  } else {
    const resolved = await resolveScan(dirs, flags, env, DEFAULT_MIN_AGE);
    rules = resolved.rules;
    idleFor = resolved.minAge;
    roots = resolved.roots;
    const result = await scanAll(roots, {
      ...resolved.options,
      signal: env.signal,
    });
    targets = result.entries
      .filter((entry) => entry.protection === undefined)
      .map((entry) => ({ path: entry.path, bytes: entry.bytes, unchangedSince: entry.lastActive }));
  }

  if (targets.length === 0) {
    if (flags.format === 'json') env.out(JSON.stringify({ deleted: [], refused: [], failed: [] }));
    else env.out('Nothing to clean.');
    return 0;
  }

  const total = targets.reduce((sum, target) => sum + (target.bytes ?? 0), 0);
  const text = flags.format === 'text';
  if (text) {
    for (const target of targets) {
      env.out(`${formatSize(target.bytes ?? 0).padStart(10)}  ${tildify(target.path, env.home)}`);
    }
    env.out('');
  }

  if (!flags.yes && !flags.dryRun) {
    if (!env.interactive) {
      throw new PurgeitError(
        'Refusing to delete without confirmation: pass --yes (or --dry-run to preview).',
      );
    }
    const question = `Delete ${plural(targets.length, 'artifact')} (${formatSize(total)})?`;
    if (!(await env.confirm(question))) {
      env.out('Aborted.');
      return 1;
    }
  }

  const deleted: { path: string; bytes: number }[] = [];
  const refused: { path: string; code: string; message: string }[] = [];
  const failed: { path: string; message: string }[] = [];
  let summary: CleanSummary | undefined;

  for await (const event of clean(targets, {
    rules,
    roots,
    idleFor,
    dryRun: flags.dryRun,
    historyFile: env.historyFile,
    signal: env.signal,
  })) {
    const path = 'path' in event ? tildify(event.path, env.home) : '';
    if (event.type === 'deleted') {
      deleted.push({ path: event.path, bytes: event.bytes });
      if (text) {
        const verb = flags.dryRun ? 'would delete' : 'deleted';
        env.out(`${styleText('green', verb)} ${formatSize(event.bytes).padStart(10)}  ${path}`);
      }
    } else if (event.type === 'refused') {
      refused.push({ path: event.path, ...event.refusal });
      if (text) env.out(`${styleText('yellow', 'skipped')} ${path}: ${event.refusal.message}`);
    } else if (event.type === 'failed') {
      failed.push({ path: event.path, message: event.message });
      if (text) env.err(`${styleText('red', 'failed')} ${path}: ${event.message}`);
    } else if (event.type === 'warning') {
      env.err(`warning: ${event.message}`);
    } else if (event.type === 'done') {
      summary = event.summary;
    }
  }
  if (summary === undefined) return 130;
  return reportRun(flags, env, {
    deleted,
    refused,
    failed,
    summary,
    interrupted: env.signal?.aborted === true,
    left: targets.length - summary.deleted - summary.refused - summary.failed,
  });
}
