---
title: Configuration
description: Extend or narrow the built-in rules, set defaults, and get editor completion.
---

purgeit reads, from the working directory (or `--config <file>`), the first of `purgeit.config.ts`, `.mts`, `.js`, `.mjs`, `.cjs`, `.json`, or the `purgeit` key of `package.json`. TypeScript configs load directly. Unknown keys and bad values are rejected with the file and the problem named.

```ts
// purgeit.config.ts
import { defineConfig } from 'purgeit';

export default defineConfig({
  safe: ['.my-cache'],
  gated: [{ name: 'out', when: [{ file: 'project.toml' }, { glob: '*.csproj' }] }],
  ignore: ['vault'],
  exclude: ['legacy/**'],
  groups: { web: ['node_modules', '.next', 'dist'] },
  minAge: '14d',
});
```

For JSON, point at the schema for completion and validation:

```json
{ "$schema": "./node_modules/purgeit/schema.json", "safe": [".my-cache"] }
```

## Keys

| Key | Meaning |
| --- | --- |
| `defaults` | `false` starts from no built-in rules (default `true`) |
| `safe` | directory names safe to delete wherever they appear |
| `gated` | `{ name, when, description? }` — deletable only when `when` holds beside it |
| `markers` | `{ name, file, signature }` — any directory whose `file` starts with `signature` |
| `disable` | built-in rule names to switch off (unknown names are an error) |
| `ignore` | directory names that are never entered |
| `exclude` | globs, relative to each root, skipped entirely |
| `groups` | named sets of rules for `--only <group>` |
| `minAge`, `minSize`, `depth` | defaults for the matching flags |

A rule of the same name as a built-in replaces it. Version-control directories are never entered, whatever the config says.

## Proof (`when`)

One condition, or a list of which any one suffices:

```json
{ "file": "package.json" }
{ "glob": "*.xcodeproj" }
{ "grep": { "file": "Makefile", "pattern": "^build:" } }
```

`file` and `glob` are checked against the directory listing the scanner already has, so they cost nothing. `grep` reads the file; if it cannot be read, that is no proof. Names are plain file names, never paths.

Rules are data, not functions: a config can always be validated, printed (`purgeit rules`) and shared.
