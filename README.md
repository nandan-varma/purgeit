# purgeit

[![npm version](https://img.shields.io/npm/v/@nandan-varma/purgeit.svg)](https://www.npmjs.com/package/@nandan-varma/purgeit)
[![CI](https://github.com/nandan-varma/purgeit/actions/workflows/ci.yml/badge.svg)](https://github.com/nandan-varma/purgeit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Find and delete regenerable dev build artifacts (`node_modules`, `dist`, `target`, `Pods`, ...) across your projects. Interactive TUI by default; scriptable via flags for CI/cron.

## Quick start

```bash
npx purgeit ~/dev
```

## Features

- **Safe by default** — nothing selected, permanent delete only after explicit multi-select + confirm
- **Interactive TUI** — browse results, see live sizes, toggle selection with space
- **Headless mode** — `--json`/`--delete` flags for scripting and CI
- **Configurable rules** — extend built-in defaults with a `purgeit.config.ts`
- **Two scan modes** — projects mode (groups by top-level dir) or flat mode (`--full`)

## CLI flags

```
purgeit [directory] [options]
  -d, --directory <path>     Root directory to scan (default: cwd)
      --full                 Flat scan mode
      --project <name>       Limit to a single project (projects mode only)
      --exclude <glob>       Exclude paths matching glob (repeatable)
      --targets <names>      Comma-separated rule names to restrict matching
      --min-size <size>      Skip matches below this size (e.g. 10MB, 500KB)
      --depth <n>            Max recursion depth
      --config <path>        Explicit config file
      --no-config            Ignore config file (defaults only)
      --no-gated             Disable gated rules (always-safe only)
      --sort <size|path|name> Sort key (default: size)
      --asc                  Ascending sort (default: descending)
      --dry-run              Preview only (default unless --delete)
      --delete               Actually delete matched artifacts
  -y, --yes                  Skip confirmation prompt (headless --delete only)
      --json                 Machine-readable JSON output
      --tui                  Force interactive TUI
      --headless             Force non-interactive mode
      --concurrency <n>      Max concurrent operations (default: 8)
      --color / --no-color   Force ANSI color
  -h, --help                 Show help
  -V, --version              Print version
```

Exit codes: 0 success, 1 nothing found / deletion had failures, 2 usage or environment error.

## Configuration

Create a `purgeit.config.ts` (or `.js`, `.json`, `.mjs`, `.cjs`) in your project root:

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

Config is resolved via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) — searches from cwd upward. Use `--config <path>` to specify explicitly, or `--no-config` for defaults only.

`.js`/`.ts`/`.cjs`/`.mjs` config files are executed as code (same trust model as ESLint/Jest configs) — only run purgeit somewhere you trust the config files that could be found by that upward search.

## Development

```bash
npm install
npm test              # vitest run
npm run coverage      # 100% threshold (excludes src/ui/)
npm run typecheck     # tsc --noEmit
npm run lint:fix      # biome check --write src/
npm run build         # tsup → dist/
```

## License

MIT
