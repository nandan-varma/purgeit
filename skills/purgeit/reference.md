## Full CLI flag reference

```
purgeit [directory] [options]
purgeit skills list | get <name> [--full]

  -d, --directory <path>     Root directory to scan (default: cwd)
      --full                 Flat scan mode: treat <directory> as one unit instead of
                              grouping its immediate children as separate projects
      --project <name>       Limit to a single top-level project by name (projects mode only)
      --exclude <glob>       Exclude paths matching glob, relative to the scanned root (repeatable)
      --targets <names>      Comma-separated rule names / named target group to restrict matching to
      --min-size <size>      Skip matches below this size (e.g. 10MB, 500KB)
      --min-age <duration>   Skip matches newer than this age (e.g. 7d, 24h) — local mtime,
                              or createdAt for cloud resources
      --max-age <duration>   Skip matches older than this age (e.g. 30d)
      --depth <n>            Max recursion depth below each scanned root (local only)
      --provider <local|aws|gcp>  Resource domain to scan (default: local). aws/gcp scan cloud
                              resources instead of local directories, always headless — see
                              `npx purgeit skills get cloud`. Rejects every local-only flag above
                              (--full, --project, --depth, --targets, --min-size, --exclude,
                              --no-gated, --tui, an explicit directory) when not "local".
      --region <region>      AWS region (--provider aws only; gcp always scans every zone/location)
      --aws-profile <name>   AWS credential profile (--provider aws only)
      --gcp-project <id>     GCP project id, required for --provider gcp
      --tag <key=value>      Tag/label filter, repeatable — ALL must match (AND semantics).
                              aws/gcp only. Falls back to config's cloud.tagKey/tagValue, then
                              purgeit-managed=true. An empty tag set is refused, not treated as
                              "match everything."
      --with-cost            Fetch billed cost estimates during discovery (--provider aws only;
                              not yet supported for gcp — no verifiable per-resource cost API exists)
      --config <path>        Explicit config file (skips upward search)
      --no-config            Ignore any discovered config file (defaults only)
      --no-gated             Disable gated-rule evaluation (always-safe only, local only)
      --sort <size|path|name>  Sort key for list/JSON output (default: size; for cloud, "size"
                              sorts by cost and "path" sorts by resource id)
      --asc                  Ascending sort (default: descending)
      --dry-run              Simulate deletion without touching anything
      --delete               Actually delete matched artifacts/resources
  -y, --yes                  Skip the confirmation prompt (headless --delete only)
      --json                 Machine-readable JSON output (forces headless mode)
      --tui                  Force the interactive TUI (local only — cloud always runs headless)
      --headless             Force non-interactive mode even in a TTY
      --concurrency <n>      Max concurrent filesystem operations (default: 8, local only)
      --color / --no-color   Force ANSI color on or off
  -h, --help                 Show help
  -V, --version              Print version
```

Exit codes: `0` success · `1` nothing found or deletion had failures · `2` usage/environment error.

`--tui`+`--headless`, `--color`+`--no-color`, `--config`+`--no-config` are mutually exclusive —
purgeit exits `2` on conflicting pairs.

## Full library API (import from `purgeit`)

**Scanning (local):**
- `scan(root, ruleSet, opts): AsyncGenerator<ScanEvent>` — `ScanEvent`/`ScanEntry`/`ScanOptions` types
- `defaultRuleSet()`, `mergeRuleSets(base, userConfig)`, `restrictRuleSetToTargets(ruleSet, tokens)`, `applyCliFilters(ruleSet, noGated, targets)`
- `createExcludeMatcher(root, patterns)`
- `RULE_CATALOG`, `CATEGORY_LABELS`, `CATEGORY_ORDER` and the `RuleDefinition`/`AlwaysSafeRuleDefinition`/`GatedRuleDefinition`/`PruneMetaRuleDefinition`/`RuleCategory` types
- `ArtifactRule`, `Gate`, `GateContext`, `ResolvedRuleSet`, `ValidationWarning` types

**Deleting (local):**
- `deleteEntries(paths, opts): AsyncGenerator<DeleteEvent>` — `DeleteEvent`/`DeleteOptions` types

**Config:**
- `loadConfig(opts): Promise<LoadedConfig>` — `LoadConfigOptions`/`LoadedConfig` types
- `PurgeitUserConfig`, `PurgeitCloudConfig`, `GateCondition`, `UserGatedRule` types

**Cloud (AWS/GCP) types** (the provider *implementations* — AWS's CloudFormation client, GCP's
Compute/Container clients — are not exported; discover/delete against them via the CLI, e.g.
`purgeit --provider aws --json --dry-run`, not directly as a library):
- `CloudProvider`, `CloudProviderId`, `CloudResource`, `CostEstimate`, `CloudDiscoveryOptions`, `CloudScanEvent`, `CloudDeleteEvent`, `CloudDeleteOptions` types
