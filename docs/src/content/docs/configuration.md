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
  alwaysSafe: ['coverage'],
  alwaysSafeRemove: ['build'],
  gated: [
    { name: 'Pods', when: { file: 'Podfile' } },
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

## Security note

`.js`/`.ts`/`.mjs`/`.cjs` config files are executed as code (the same trust model as ESLint or Jest configs). Only run purgeit in directories where you trust the config files that cosmiconfig might discover during its upward search.
