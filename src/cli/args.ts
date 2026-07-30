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
      --min-age <duration>    Skip matches newer than this age (e.g. 7d, 24h)
      --max-age <duration>    Skip matches older than this age (e.g. 30d)
      --depth <n>             Max recursion depth safety valve (default: unlimited)
      --provider <local|aws|gcp> Resource domain to scan (default: local). aws/gcp scan
                              cloud resources (tagged CloudFormation stacks / labeled
                              Compute Engine+GKE resources) instead of local directories
                              — cannot be combined with local-only options below.
      --region <region>       AWS region (--provider aws only; gcp always discovers
                              across every zone/location in the project)
      --aws-profile <name>    AWS credential profile (--provider aws only)
      --gcp-project <id>      GCP project id, required for --provider gcp
      --tag <key=value>       Tag/label filter, repeatable (aws/gcp only; default from
                              config's cloud.tagKey/tagValue, else purgeit-managed=true)
      --with-cost             Fetch billed cost estimates during discovery
                              (--provider aws only; not yet supported for gcp)
      --config <path>        Explicit config file (skips search)
      --no-config            Ignore any discovered config file (defaults only)
      --no-gated             Disable gated-rule evaluation (always-safe only, local only)
      --sort <size|path|name> Sort key for list/JSON output (default: size)
      --asc                  Ascending sort (default: descending)
      --dry-run              Simulate deletion without touching files. In headless mode
                              this is the default unless --delete is given; in a TTY
                              the TUI still opens and confirmed deletions are simulated.
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
export type CliProvider = 'local' | 'aws' | 'gcp';

export interface ParsedCli {
  directory: string;
  full: boolean;
  project: string | undefined;
  exclude: string[];
  targets: string[];
  minSize: string | undefined;
  minAge: string | undefined;
  maxAge: string | undefined;
  depth: number | undefined;
  provider: CliProvider;
  region: string | undefined;
  awsProfile: string | undefined;
  gcpProject: string | undefined;
  /** Raw "key=value" tag/label filters from repeatable --tag; parsed and format-validated here. */
  tags: { key: string; value: string }[];
  withCost: boolean;
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
const PROVIDERS: readonly CliProvider[] = ['local', 'aws', 'gcp'];

function parsePositiveInt(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`invalid --${flag} '${value}' (expected an integer >= 1)`);
  }
  return parsed;
}

function parseTag(raw: string): { key: string; value: string } {
  const eq = raw.indexOf('=');
  if (eq <= 0 || eq === raw.length - 1) {
    throw new Error(`invalid --tag '${raw}' (expected 'key=value')`);
  }
  return { key: raw.slice(0, eq), value: raw.slice(eq + 1) };
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
      'min-age': { type: 'string' },
      'max-age': { type: 'string' },
      depth: { type: 'string' },
      provider: { type: 'string' },
      region: { type: 'string' },
      'aws-profile': { type: 'string' },
      'gcp-project': { type: 'string' },
      tag: { type: 'string', multiple: true },
      'with-cost': { type: 'boolean' },
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

  const provider = (values.provider ?? 'local') as CliProvider;
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`invalid --provider '${values.provider}' (expected local | aws | gcp)`);
  }

  const directoryExplicit = values.directory !== undefined || positionals[0] !== undefined;
  if (provider !== 'local') {
    const localOnly: string[] = [];
    if (directoryExplicit) localOnly.push('a directory argument');
    if (values.full) localOnly.push('--full');
    if (values.project !== undefined) localOnly.push('--project');
    if (values.depth !== undefined) localOnly.push('--depth');
    if ((values.targets ?? '').trim().length > 0) localOnly.push('--targets');
    if (values['min-size'] !== undefined) localOnly.push('--min-size');
    if (values.exclude !== undefined && values.exclude.length > 0) localOnly.push('--exclude');
    if (values['no-gated']) localOnly.push('--no-gated');
    if (localOnly.length > 0) {
      throw new Error(`--provider ${provider} cannot be combined with ${localOnly.join(', ')}`);
    }
  } else {
    const cloudOnly: string[] = [];
    if (values.region !== undefined) cloudOnly.push('--region');
    if (values['aws-profile'] !== undefined) cloudOnly.push('--aws-profile');
    if (values['gcp-project'] !== undefined) cloudOnly.push('--gcp-project');
    if (values.tag !== undefined && values.tag.length > 0) cloudOnly.push('--tag');
    if (values['with-cost']) cloudOnly.push('--with-cost');
    if (cloudOnly.length > 0) {
      throw new Error(`${cloudOnly.join(', ')} requires --provider aws|gcp`);
    }
  }
  if (provider !== 'aws' && values['aws-profile'] !== undefined) {
    throw new Error('--aws-profile requires --provider aws');
  }
  if (provider !== 'gcp' && values['gcp-project'] !== undefined) {
    throw new Error('--gcp-project requires --provider gcp');
  }
  if (provider !== 'aws' && values.region !== undefined) {
    throw new Error(
      '--region requires --provider aws (gcp always discovers across every zone/location in the project)',
    );
  }
  if (provider === 'gcp' && values['with-cost']) {
    throw new Error('--with-cost is not yet supported for --provider gcp');
  }

  const tags = (values.tag ?? []).map(parseTag);

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
    minAge: values['min-age'],
    maxAge: values['max-age'],
    depth: values.depth !== undefined ? parsePositiveInt('depth', values.depth) : undefined,
    provider,
    region: values.region,
    awsProfile: values['aws-profile'],
    gcpProject: values['gcp-project'],
    tags,
    withCost: values['with-cost'] ?? false,
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
