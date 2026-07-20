import { parseArgs } from 'node:util';

export const USAGE = `Usage: purgeit [directory] [options]

Find and delete regenerable dev build artifacts (node_modules, dist, target,
Pods, ...) across your projects. Interactive by default in a terminal;
scriptable via flags otherwise.

Options:
  -d, --directory <path>     Root directory to scan (default: cwd)
      --full                 Flat scan mode: treat <directory> as one unit
                              instead of grouping its immediate children as
                              separate projects (default: "projects" mode)
      --project <name>       Limit to a single top-level project by name
                              (only meaningful in default "projects" mode)
      --exclude <glob>       Exclude paths matching glob (repeatable)
      --targets <names>      Comma-separated rule names / named target group
                              to restrict matching to (e.g. --targets
                              node_modules,dist, or a group from config)
      --min-size <size>      Skip matches below this size (e.g. 10MB, 500KB)
      --depth <n>             Max recursion depth safety valve (default: unlimited)
      --config <path>        Explicit config file (skips search)
      --no-config            Ignore any discovered config file (defaults only)
      --no-gated             Disable gated-rule evaluation (always-safe only)
      --sort <size|path|name> Sort key for list/JSON output (default: size)
      --asc                  Ascending sort (default: descending)
      --dry-run              Show what would be deleted; never deletes
                              (default unless --delete is given)
      --delete               Actually delete matched artifacts
  -y, --yes                  Skip the confirmation prompt (headless --delete only)
      --json                 Emit machine-readable JSON (disables the TUI)
      --tui                  Force the interactive TUI even when stdout isn't a TTY
      --headless             Force non-interactive mode even in a TTY
      --concurrency <n>      Max concurrent filesystem operations (default: 8)
      --color                Force ANSI color on
      --no-color             Force ANSI color off
  -h, --help                 Show this help
  -V, --version              Print the version

Exit codes: 0 success, 1 nothing found / deletion had failures, 2 usage or environment error`;

export type SortKey = 'size' | 'path' | 'name';

export interface ParsedCli {
  directory: string;
  full: boolean;
  project: string | undefined;
  exclude: string[];
  targets: string[];
  minSize: string | undefined;
  depth: number | undefined;
  configPath: string | undefined;
  noConfig: boolean;
  noGated: boolean;
  sort: SortKey;
  ascending: boolean;
  dryRun: boolean;
  delete: boolean;
  yes: boolean;
  json: boolean;
  tui: boolean;
  headless: boolean;
  concurrency: number;
  color: boolean | undefined;
}

const SORT_KEYS: readonly SortKey[] = ['size', 'path', 'name'];

function parsePositiveInt(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`invalid --${flag} '${value}' (expected an integer >= 1)`);
  }
  return parsed;
}

/** Parses argv into a ParsedCli, or returns 'help'/'version' for those flags. Throws on bad input. */
export function parseCliArgs(argv: string[]): ParsedCli | 'help' | 'version' {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      directory: { type: 'string', short: 'd' },
      full: { type: 'boolean' },
      project: { type: 'string' },
      exclude: { type: 'string', multiple: true },
      targets: { type: 'string' },
      'min-size': { type: 'string' },
      depth: { type: 'string' },
      config: { type: 'string' },
      'no-config': { type: 'boolean' },
      'no-gated': { type: 'boolean' },
      sort: { type: 'string' },
      asc: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      delete: { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      json: { type: 'boolean' },
      tui: { type: 'boolean' },
      headless: { type: 'boolean' },
      concurrency: { type: 'string' },
      color: { type: 'boolean' },
      'no-color': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'V' },
    },
  });

  if (values.help) return 'help';
  if (values.version) return 'version';

  if (positionals.length > 1) {
    throw new Error(`unexpected extra argument '${positionals[1]}'`);
  }
  if (values.directory !== undefined && positionals[0] !== undefined) {
    throw new Error('pass the directory as either a positional argument or --directory, not both');
  }

  const sort = values.sort ?? 'size';
  if (!SORT_KEYS.includes(sort as SortKey)) {
    throw new Error(`invalid --sort '${sort}' (expected size | path | name)`);
  }

  if (values.tui && values.headless) {
    throw new Error('--tui and --headless cannot be combined');
  }
  if (values.color && values['no-color']) {
    throw new Error('--color and --no-color cannot be combined');
  }
  if (values.config !== undefined && values['no-config']) {
    throw new Error('--config and --no-config cannot be combined');
  }

  return {
    directory: values.directory ?? positionals[0] ?? '.',
    full: values.full ?? false,
    project: values.project,
    exclude: values.exclude ?? [],
    targets: (values.targets ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
    minSize: values['min-size'],
    depth: values.depth !== undefined ? parsePositiveInt('depth', values.depth) : undefined,
    configPath: values.config,
    noConfig: values['no-config'] ?? false,
    noGated: values['no-gated'] ?? false,
    sort: sort as SortKey,
    ascending: values.asc ?? false,
    dryRun: values['dry-run'] ?? false,
    delete: values.delete ?? false,
    yes: values.yes ?? false,
    json: values.json ?? false,
    tui: values.tui ?? false,
    headless: values.headless ?? false,
    concurrency:
      values.concurrency !== undefined ? parsePositiveInt('concurrency', values.concurrency) : 8,
    color: values.color ? true : values['no-color'] ? false : undefined,
  };
}
