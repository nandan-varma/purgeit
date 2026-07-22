---
title: API reference
description: Programmatic API for the purgeit scanner and rule engine.
---

The `purgeit` package exports a framework-agnostic API for scanning, deleting, and configuring rules. It does not include the TUI components.

## Load config

```ts
import { loadConfig } from 'purgeit';

const { config, filepath } = await loadConfig({
  cwd: process.cwd(),
});
```

## Build a ruleset

```ts
import { defaultRuleSet, mergeRuleSets, restrictRuleSetToTargets, applyCliFilters } from 'purgeit';

const base = defaultRuleSet();
const withUser = mergeRuleSets(base, config);

// Restrict to one or more rule names, or target groups defined in config.
const restricted = restrictRuleSetToTargets(withUser, ['node_modules', 'dist']);

// Or apply the same CLI-style filters the headless/TUI paths use.
const filtered = applyCliFilters(withUser, /* noGated */ false, /* targets */ ['node_modules']);
```

## Scan

```ts
import { scan } from 'purgeit';

for await (const event of scan('/path/to/projects', ruleSet, { mode: 'projects' })) {
  if (event.type === 'found') {
    console.log('found', event.entry.path);
  } else if (event.type === 'size') {
    console.log('size', event.path, event.bytes);
  } else if (event.type === 'done') {
    console.log('total', event.totalBytes);
  }
}
```

## Delete

```ts
import { deleteEntries } from 'purgeit';

for await (const event of deleteEntries(paths, { dryRun: true })) {
  console.log(event);
}
```

## Exclude matcher

```ts
import { createExcludeMatcher } from 'purgeit';

const isExcluded = createExcludeMatcher(root, ['legacy/*', '*.log']);
console.log(isExcluded('/root/legacy/dist')); // true
```

## Types

Exported types include:

- `ScanEntry`, `ScanEvent`, `ScanOptions`
- `DeleteEvent`, `DeleteOptions`
- `ArtifactRule`, `Gate`, `GateContext`, `ResolvedRuleSet`, `ValidationWarning`
- `PurgeitUserConfig`, `UserGatedRule`, `GateCondition`
- `LoadConfigOptions`, `LoadedConfig`

## Gated rules

You can provide a custom `Gate` function in user configs:

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

The `GateContext` provides:

- `path`: the candidate path
- `parent`: the candidate's parent directory
- `siblingFile(name)`: true if a sibling file exists
- `siblingGlob(pattern)`: true if any sibling entry matches the glob
- `siblingGrep(name, pattern)`: true if the sibling file exists and matches the regex

## CLI-style filters

`applyCliFilters` is the same helper used by the headless runner and the TUI to apply `--no-gated` and `--targets` after merging user config:

```ts
import { applyCliFilters } from 'purgeit';

const ruleSet = applyCliFilters(withUser, /* noGated */ true, /* targets */ ['frontend']);
```

`restrictRuleSetToTargets` is the lower-level helper that expands target group names to their member rule names and returns a ruleset containing only those names.
