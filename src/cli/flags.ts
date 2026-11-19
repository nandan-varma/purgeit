import { Option } from 'commander';
import { PurgeitError } from '../errors.js';

/** The flags every command that looks for artifacts shares. */
export interface ScanFlags {
  exclude: string[];
  only: string[];
  safeOnly: boolean;
  minSize?: string;
  minAge?: string;
  depth?: number;
  includeEmpty: boolean;
  discover: boolean;
  config: string | boolean;
}

const collect = (value: string, previous: string[]): string[] => [
  ...previous,
  ...value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean),
];

const positiveInteger = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new PurgeitError(`Invalid depth "${value}" — expected a positive integer.`);
  }
  return parsed;
};

/** The shared options, in the order `--help` shows them. */
export function scanOptions(minAgeHint: string): Option[] {
  return [
    new Option('--discover', 'also scan the folders where this machine keeps projects').default(
      false,
    ),
    new Option('-x, --exclude <glob>', 'skip directories matching a glob (repeatable)')
      .argParser(collect)
      .default([]),
    new Option(
      '--only <rules>',
      'only look for these rules or groups (repeatable, comma-separated)',
    )
      .argParser(collect)
      .default([]),
    new Option('--safe-only', 'skip rules that need a sibling manifest as proof').default(false),
    new Option('--min-size <size>', 'ignore artifacts smaller than this, e.g. 50MB'),
    new Option(
      '--min-age <duration>',
      `ignore artifacts touched more recently than this, e.g. 7d. ${minAgeHint}`,
    ),
    new Option('--depth <n>', 'never descend deeper than this').argParser(positiveInteger),
    new Option('--include-empty', 'keep artifacts that contain no files').default(false),
    new Option(
      '--config <file>',
      'use this config file instead of searching the working directory',
    ),
    new Option('--no-config', 'ignore any config file'),
  ];
}
