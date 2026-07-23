---
title: API reference
description: Programmatic API for the purgeit scanner, rule engine, and deleter.
---

The `purgeit` package exports a framework-agnostic API for scanning, deleting, and configuring rules — everything the CLI uses internally, minus the Ink TUI. Use it to build your own tooling (a cleanup dashboard, a CI check that fails above a size threshold, a custom prompt flow) on top of the same engine.

```bash
npm install purgeit
```

```ts
import { scan, deleteEntries, defaultRuleSet, loadConfig } from 'purgeit';
```

## Load config

```ts
import { loadConfig } from 'purgeit';

const { config, filepath } = await loadConfig({
  cwd: process.cwd(),
});
```

`loadConfig` searches upward from `cwd` for a `purgeit.config.{js,mjs,cjs,ts,mts,cts,json}`, `.purgeitrc`/`.purgeitrc.json`, or a `"purgeit"` key in `package.json` — the same [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) resolution the CLI uses. `config` is `undefined` if none was found; a config file that exists but doesn't match the expected shape throws a descriptive `TypeError` naming the offending file and field.

```ts
interface LoadConfigOptions {
  /** Directory to start the upward search from. Defaults to process.cwd(). */
  cwd?: string;
  /** Explicit config file path — bypasses search entirely. */
  configPath?: string;
  /** Skip resolution entirely; equivalent to no config file existing. */
  noConfig?: boolean;
  /** Directory the upward search must not go above. Mainly for tests. */
  stopDir?: string;
}

interface LoadedConfig {
  config: PurgeitUserConfig | undefined;
  filepath: string | undefined;
}
```

See [Configuration](/configuration/) for `PurgeitUserConfig`'s full shape.

## Build a ruleset

```ts
import { defaultRuleSet, mergeRuleSets, restrictRuleSetToTargets, applyCliFilters } from 'purgeit';

const base = defaultRuleSet();
const withUser = mergeRuleSets(base, config); // config may be undefined

// Restrict to one or more rule names, or target groups defined in config.
const restricted = restrictRuleSetToTargets(withUser, ['node_modules', 'dist']);

// Or apply the same CLI-style filters the headless/TUI paths use.
const filtered = applyCliFilters(withUser, /* noGated */ false, /* targets */ ['node_modules']);
```

Every scan needs a `ResolvedRuleSet` — the compiled, ready-to-match form of the built-in defaults plus any user config:

```ts
interface ResolvedRuleSet {
  alwaysSafe: ReadonlySet<string>;
  gated: ReadonlyMap<string, Gate>;
  pruneMeta: ReadonlySet<string>; // e.g. .git, .hg, .svn — never descended into
  skipDirs: ReadonlySet<string>;
  targets: ReadonlyMap<string, readonly string[]>;
}
```

`defaultRuleSet()` returns the built-in rules ([full list](/rules/)) with no user config layered in. `mergeRuleSets(base, config)` applies a `PurgeitUserConfig` on top (or replaces it entirely, per `config.extends`). `restrictRuleSetToTargets(ruleSet, names)` narrows a ruleset to only the given rule names, expanding any named target groups first — this is the lower-level helper; `applyCliFilters(ruleSet, noGated, targets)` is what the CLI actually calls, combining `--no-gated` and `--targets` in one step.

## Rule catalog

`defaultRuleSet()` gives you the *compiled* form ready for `scan()`. If you want the underlying data instead — names, ecosystem categories, human-readable descriptions, and each gated rule's declarative condition — `RULE_CATALOG` is the same source of truth the built-in ruleset (and the [rules docs page](/rules/)) are generated from:

```ts
import { RULE_CATALOG, CATEGORY_LABELS, CATEGORY_ORDER } from 'purgeit';

for (const rule of RULE_CATALOG) {
  if (rule.categories.includes('python')) {
    console.log(rule.name, '—', rule.description);
  }
}
```

```ts
type RuleCategory =
  | 'javascript-typescript' | 'python' | 'rust' | 'go' | 'php' | 'ruby'
  | 'java-jvm' | 'dotnet' | 'apple' | 'elixir' | 'haskell' | 'elm'
  | 'zig' | 'dart-flutter' | 'cpp' | 'vcs';

const CATEGORY_LABELS: Record<RuleCategory, string>; // e.g. 'java-jvm' -> 'Java / JVM (Gradle, Maven, Android, Eclipse)'
const CATEGORY_ORDER: readonly RuleCategory[]; // fixed display order

type RuleDefinition = AlwaysSafeRuleDefinition | GatedRuleDefinition | PruneMetaRuleDefinition;

interface AlwaysSafeRuleDefinition {
  kind: 'always-safe';
  name: string;
  categories: readonly RuleCategory[]; // usually one; a few (build, vendor, target) are genuinely polyglot
  description: string;
}

interface GatedRuleDefinition {
  kind: 'gated';
  name: string;
  categories: readonly RuleCategory[];
  description: string;
  when: GateCondition | readonly GateCondition[]; // same declarative shape as config's `gated[].when`
}

interface PruneMetaRuleDefinition {
  kind: 'prune-meta'; // VCS metadata (.git, .hg, .svn) — never a deletion candidate
  name: string;
  categories: readonly RuleCategory[];
  description: string;
}
```

This is exactly what [`/rules/`](/rules/) renders — if you're building your own UI on top of purgeit (a dashboard, a different CLI, a config generator), `RULE_CATALOG` means you never have to hand-copy or re-derive the rule list yourself.

## Scan

```ts
import { scan } from 'purgeit';

for await (const event of scan('/path/to/projects', ruleSet, { mode: 'projects' })) {
  if (event.type === 'found') {
    console.log('found', event.entry.path, event.entry.kind);
  } else if (event.type === 'size') {
    console.log('size', event.path, event.bytes);
  } else if (event.type === 'done') {
    console.log('total', event.totalBytes);
  }
}
```

`scan()` is an async generator: it streams `found` events the instant a match is discovered (`size: null`), then an independent `size` event once that match's byte count finishes computing — discovery is never blocked on sizing, so a UI built on this can render results progressively.

```ts
function scan(
  root: string,
  ruleSet: ResolvedRuleSet,
  opts?: ScanOptions,
): AsyncGenerator<ScanEvent>;

interface ScanOptions {
  signal?: AbortSignal;
  /** 'projects' (default) groups root's immediate children as separate projects;
   * 'flat' treats root as a single scan unit. */
  mode?: 'projects' | 'flat';
  /** Limit to one named project (projects mode only). */
  targetProject?: string;
  /** Max concurrent filesystem operations (directory reads + size computations). Default 8. */
  concurrency?: number;
  /** Never descend more than this many levels below each scanned root. Default: unlimited. */
  maxDepth?: number;
}

type ScanEvent =
  | { type: 'project-start'; project: string; label: string }
  | { type: 'found'; entry: ScanEntry }
  | { type: 'size'; path: string; bytes: number }
  | { type: 'warning'; warning: ValidationWarning }
  | { type: 'done'; totalBytes: number };

interface ScanEntry {
  path: string;
  project: string;
  kind: 'always-safe' | 'gated';
  ruleName: string;
  size: number | null; // null until the matching 'size' event arrives
}

interface ValidationWarning {
  file: string;
  message: string; // e.g. a corrupted package.json noticed while detecting project type
}
```

Pass an `AbortSignal` to stop a scan early — matches already found before the abort still land in the stream, but discovery and pending size computations stop promptly.

## Delete

```ts
import { deleteEntries } from 'purgeit';

for await (const event of deleteEntries(paths, { dryRun: true })) {
  if (event.type === 'deleted') console.log('deleted', event.path);
  else if (event.type === 'error') console.error('failed', event.path, event.message);
  else if (event.type === 'done') console.log(`${event.deleted} deleted, ${event.failed} failed`);
}
```

```ts
function deleteEntries(
  paths: readonly string[],
  opts?: DeleteOptions,
): AsyncGenerator<DeleteEvent>;

interface DeleteOptions {
  signal?: AbortSignal;
  /** Simulate deletion without touching the filesystem. */
  dryRun?: boolean;
  /** Max concurrent deletion operations. Default 8. */
  concurrency?: number;
}

type DeleteEvent =
  | { type: 'deleting'; path: string }
  | { type: 'deleted'; path: string; dryRun: boolean }
  | { type: 'error'; path: string; message: string }
  | { type: 'done'; deleted: number; failed: number };
```

`deleteEntries` continues past individual failures rather than aborting the whole batch — one bad path (permission denied, already gone) shows up as an `error` event and gets counted in the final `done`, everything else still gets deleted. As a last line of defense independent of whatever the rule engine matched, it also refuses to delete the filesystem root or the current user's home directory, surfacing that refusal as a normal `error` event rather than throwing.

## Exclude matcher

```ts
import { createExcludeMatcher } from 'purgeit';

const isExcluded = createExcludeMatcher(root, ['legacy/*', '*.log']);
console.log(isExcluded('/root/legacy/dist')); // true
```

Glob patterns are matched against the path relative to `root`, POSIX-normalized so behavior is identical on Windows. This is the same matcher the CLI's `--exclude` uses — reach for it if you're filtering `scan()`'s output yourself instead of going through the CLI.

## Gated rules and `GateContext`

You can provide a custom `Gate` function in user configs (or construct one directly for programmatic use):

```ts
export default {
  gated: [
    {
      name: 'build',
      gate: (ctx) => ctx.siblingFile('package.json') && !ctx.siblingFile('keep-build'),
    },
  ],
};
```

```ts
type Gate = (ctx: GateContext) => boolean;

interface GateContext {
  path: string;   // the candidate directory being evaluated
  parent: string; // its parent directory
  /** True if `parent/name` exists. */
  siblingFile(name: string): boolean;
  /** True if any entry directly inside `parent` matches the glob (`*`/`?` wildcards). */
  siblingGlob(pattern: string): boolean;
  /** True if `parent/name` exists and its contents match `pattern`. */
  siblingGrep(name: string, pattern: RegExp): boolean;
}
```

A `Gate` must be synchronous — all three `GateContext` probes are sync `fs` calls scoped to the candidate's parent directory, so gate evaluation never blocks the async scan pipeline.

## CLI-style filters

`applyCliFilters` is the same helper the headless runner and the TUI use to apply `--no-gated` and `--targets` after merging user config:

```ts
import { applyCliFilters } from 'purgeit';

const ruleSet = applyCliFilters(withUser, /* noGated */ true, /* targets */ ['frontend']);
```

## Rule shapes

```ts
type ArtifactRule = AlwaysSafeRule | GatedRule;

interface AlwaysSafeRule {
  kind: 'always-safe';
  name: string;
}

interface GatedRule {
  kind: 'gated';
  name: string;
  gate: Gate;
  description?: string;
}
```

## All exports

| Export | Kind |
| --- | --- |
| `scan` | function — `(root, ruleSet, opts?) => AsyncGenerator<ScanEvent>` |
| `deleteEntries` | function — `(paths, opts?) => AsyncGenerator<DeleteEvent>` |
| `loadConfig` | function — `(opts?) => Promise<LoadedConfig>` |
| `defaultRuleSet` | function — `() => ResolvedRuleSet` |
| `mergeRuleSets` | function — `(base, userConfig?) => ResolvedRuleSet` |
| `restrictRuleSetToTargets` | function — `(ruleSet, names) => ResolvedRuleSet` |
| `applyCliFilters` | function — `(ruleSet, noGated, targets) => ResolvedRuleSet` |
| `createExcludeMatcher` | function — `(root, patterns) => (path: string) => boolean` |
| `RULE_CATALOG` | value — `readonly RuleDefinition[]`, the full built-in rule catalog |
| `CATEGORY_LABELS` | value — `Record<RuleCategory, string>` display labels |
| `CATEGORY_ORDER` | value — `readonly RuleCategory[]` fixed display order |
| `ScanEntry`, `ScanEvent`, `ScanOptions` | types |
| `DeleteEvent`, `DeleteOptions` | types |
| `ArtifactRule`, `Gate`, `GateContext`, `ResolvedRuleSet`, `ValidationWarning` | types |
| `PurgeitUserConfig`, `UserGatedRule`, `GateCondition` | types |
| `LoadConfigOptions`, `LoadedConfig` | types |
| `RuleCategory`, `RuleDefinition`, `AlwaysSafeRuleDefinition`, `GatedRuleDefinition`, `PruneMetaRuleDefinition` | types |

The Ink TUI (`src/ui/`) is intentionally not part of this package's public API — only `react`/`ink`-free code is exported, so this package can be used as a plain library with no UI dependency.
