import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { styleText } from 'node:util';
import { clean, type Target } from '../../clean/clean.js';
import { PurgeitError } from '../../errors.js';
import { scanAll } from '../../scan/scan.js';
import { formatSize, parseDuration } from '../../units.js';
import type { CliEnv } from '../env.js';
import type { ScanFlags } from '../flags.js';
import { resolveRules, resolveScan } from '../options.js';
import { tildify } from '../render.js';
import { parsePlan } from '../report.js';

export interface CleanCommandFlags extends ScanFlags {
  plan?: string;
  yes: boolean;
  dryRun: boolean;
  format: 'text' | 'json';
}

const DEFAULT_MIN_AGE = '7d';

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Finds artifacts (or reads a reviewed plan) and deletes them. Every path is
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
      .filter((entry) => entry.protection == null)
      .map((entry) => ({
        path: entry.path,
        ...(entry.bytes === undefined ? {} : { bytes: entry.bytes }),
        ...(entry.lastActive === undefined ? {} : { unchangedSince: entry.lastActive }),
      }));
  } else {
    const resolved = await resolveScan(dirs, flags, env, DEFAULT_MIN_AGE);
    rules = resolved.rules;
    idleFor = resolved.minAge;
    roots = resolved.roots;
    const result = await scanAll(roots, {
      ...resolved.options,
      ...(env.signal === undefined ? {} : { signal: env.signal }),
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
  let summary: { deleted: number; refused: number; failed: number; bytes: number } | undefined;

  for await (const event of clean(targets, {
    rules,
    roots,
    idleFor,
    dryRun: flags.dryRun,
    ...(env.historyFile === undefined ? {} : { historyFile: env.historyFile }),
    ...(env.signal === undefined ? {} : { signal: env.signal }),
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

  if (text) {
    const head = flags.dryRun
      ? `Dry run: would delete ${plural(summary.deleted, 'artifact')}, freeing ${formatSize(summary.bytes)}`
      : `Deleted ${plural(summary.deleted, 'artifact')}, freed ${formatSize(summary.bytes)}`;
    const rest = [
      summary.refused > 0 ? `${summary.refused} skipped` : '',
      summary.failed > 0 ? `${summary.failed} failed` : '',
    ].filter(Boolean);
    env.out(rest.length === 0 ? head : `${head} (${rest.join(', ')})`);
  } else {
    env.out(JSON.stringify({ dryRun: flags.dryRun, deleted, refused, failed, summary }, null, 2));
  }
  return summary.refused > 0 || summary.failed > 0 ? 1 : 0;
}
