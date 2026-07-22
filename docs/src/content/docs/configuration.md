---
title: Configuration
description: Customize purgeit's rules with purgeit.config.ts.
---

purgeit looks for a configuration file via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig). It searches upward from the current working directory for any of these files:

- `package.json` (under a `"purgeit"` key)
- `purgeit.config.js`, `.mjs`, `.cjs`
- `purgeit.config.ts`, `.mts`, `.cts`
- `purgeit.config.json`
- `.purgeitrc`, `.purgeitrc.json`

Use `--config <path>` to specify an explicit file, or `--no-config` to skip config loading entirely.

## Example

```ts
export default {
  extends: 'merge', // 'merge' (default) or 'replace'
  skipDirs: ['tmp', '_tmp_clone'],
  alwaysSafeRemove: ['coverage'],
  gated: [
    { name: 'generated', when: { file: 'codegen.json' } },
  ],
  targets: {
    frontend: ['node_modules', '.next', 'dist'],
  },
};
```

## Options

### `extends`

- `'merge'` (default): layer your config on top of the built-in ruleset.
- `'replace'`: start from an empty ruleset and define everything yourself.

### `alwaysSafe`

Array of directory names that are always safe to delete wherever they appear.

### `alwaysSafeRemove`

Array of directory names to remove from the built-in `alwaysSafe` list.

### `gated`

Array of rules that are only deletable when a sibling condition is met. Each rule has a `name` and either:

- a declarative `when` condition, or
- a function `gate`.

```ts
{
  gated: [
    { name: 'build', when: { file: 'package.json' } },
    { name: 'custom', when: [{ file: 'Makefile' }, { glob: '*.mk' }] },
    { name: 'custom-code', gate: (ctx) => ctx.siblingFile('README.md') },
  ],
}
```

Declarative conditions:

| Condition | Meaning |
| --- | --- |
| `{ file: 'X' }` | `X` exists in the same parent directory |
| `{ glob: 'X' }` | A sibling entry matches the glob |
| `{ grep: { file: 'X', pattern: 'Y' } }` | `X` exists and its contents match `Y` |

### `gatedRemove`

Array of gated rule names to remove from the built-in list.

### `skipDirs`

Array of directory names that purgeit should not descend into during scanning.

### `pruneNames`

Array of directory names to treat as VCS-like metadata (never descended into).

### `targets`

Named groups of rule names. You can then use `--targets <group-name>` on the CLI to restrict matching to that group.

```ts
{
  targets: {
    frontend: ['node_modules', '.next', 'dist'],
  },
}
```

```bash
purgeit --targets frontend
```

## Common patterns

### Replace the entire ruleset

Use `extends: 'replace'` when you want full control and do not want any built-in defaults:

```ts
export default {
  extends: 'replace',
  alwaysSafe: ['node_modules', 'dist'],
  skipDirs: ['.git'],
};
```

### Remove a built-in rule

If a built-in always-safe rule does not match your workflow, remove it instead of adding it:

```ts
export default {
  alwaysSafeRemove: ['.nyc_output'],
};
```

Remove a gated rule entirely:

```ts
export default {
  gatedRemove: ['Pods'],
};
```

### Add a custom gated rule

Custom rules are useful for project-specific generated directories. For example, a `generated/` directory that should only be deleted when a `codegen.json` manifest is present:

```ts
export default {
  gated: [
    { name: 'generated', when: { file: 'codegen.json' } },
  ],
};
```

Use multiple OR conditions:

```ts
export default {
  gated: [
    {
      name: 'build',
      when: [{ file: 'Makefile' }, { glob: '*.cmake' }],
    },
  ],
};
```

Use a function gate for logic that declarative conditions cannot express:

```ts
export default {
  gated: [
    {
      name: 'scratch',
      gate: (ctx) => ctx.siblingFile('README.md') && !ctx.siblingFile('keep-scratch'),
    },
  ],
};
```

### Skip directories during scanning

`skipDirs` prevents purgeit from descending into directories. This is useful for large, non-project folders inside your scan root:

```ts
export default {
  skipDirs: ['backups', 'archives', 'node_modules'],
};
```

### Target groups

Define named groups of rules so you can run focused cleanups from the CLI:

```ts
export default {
  targets: {
    frontend: ['node_modules', '.next', 'dist'],
    mobile: ['Pods', 'build', '.gradle'],
    python: ['__pycache__', '.venv', '.tox'],
  },
};
```

```bash
purgeit --targets frontend
purgeit --targets mobile,python
```

Target groups can also reference other target groups indirectly by listing their member names.

## Security note

`.js`/`.ts`/`.mjs`/`.cjs` config files are executed as code (the same trust model as ESLint or Jest configs). Only run purgeit in directories where you trust the config files that cosmiconfig might discover during its upward search.
