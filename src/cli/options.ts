import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../config/load.js';
import { ConfigSchema } from '../config/schema.js';
import { PurgeitError } from '../errors.js';
import { createRuleSet, onlySafeRules, type RuleSet, restrictRuleSet } from '../rules/rule-set.js';
import { discoverRoots } from '../scan/discover.js';
import type { ScanOptions } from '../scan/scan.js';
import { parseDuration, parseSize } from '../units.js';
import type { CliEnv } from './env.js';
import type { ScanFlags } from './flags.js';

/** A scan fully resolved from arguments, flags and config. */
export interface ResolvedScan {
  readonly roots: string[];
  readonly rules: RuleSet;
  readonly options: Omit<ScanOptions, 'signal' | 'io'>;
  /** Refuse to delete anything modified more recently than this (ms). */
  readonly minAge: number;
  readonly configSource: string | undefined;
}

async function assertDirectory(path: string): Promise<void> {
  const stats = await stat(path).catch(() => undefined);
  if (stats === undefined) throw new PurgeitError(`No such directory: ${path}`);
  if (!stats.isDirectory()) throw new PurgeitError(`Not a directory: ${path}`);
}

export async function resolveRules(
  flags: Pick<ScanFlags, 'config' | 'only' | 'safeOnly'>,
  env: CliEnv,
) {
  const loaded =
    flags.config === false
      ? { config: ConfigSchema.parse({}), source: undefined }
      : await loadConfig({
          cwd: env.cwd,
          ...(typeof flags.config === 'string' ? { file: resolve(env.cwd, flags.config) } : {}),
        });
  let rules = createRuleSet(loaded.config);
  if (flags.only.length > 0) rules = restrictRuleSet(rules, flags.only);
  if (flags.safeOnly) rules = onlySafeRules(rules);
  return { config: loaded.config, rules, source: loaded.source };
}

/**
 * Turns directories, flags and config into one scan. Flags beat config; with
 * no directories the working directory is scanned (or, with --discover, the
 * discovered project folders).
 */
export async function resolveScan(
  dirs: readonly string[],
  flags: ScanFlags,
  env: CliEnv,
  defaultMinAge: string,
): Promise<ResolvedScan> {
  const { config, rules, source } = await resolveRules(flags, env);

  let roots = dirs.map((dir) => resolve(env.cwd, dir));
  if (flags.discover) {
    const found = await discoverRoots(rules, env.home === undefined ? {} : { home: env.home });
    roots = [...roots, ...found];
    if (roots.length === 0) throw new PurgeitError('No project folders found to discover.');
  } else if (roots.length === 0) {
    roots = [env.cwd];
  }
  await Promise.all(roots.map(assertDirectory));

  const minAge = parseDuration(flags.minAge ?? config.minAge ?? defaultMinAge);
  const minSize = flags.minSize ?? config.minSize;
  const depth = flags.depth ?? config.depth;
  return {
    roots,
    rules,
    configSource: source,
    minAge,
    options: {
      rules,
      exclude: [...config.exclude, ...flags.exclude],
      minAge,
      includeEmpty: flags.includeEmpty,
      ...(minSize === undefined ? {} : { minBytes: parseSize(minSize) }),
      ...(depth === undefined ? {} : { depth }),
      ...(env.home === undefined ? {} : { home: env.home }),
    },
  };
}
