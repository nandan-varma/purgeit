# purgeit

[![npm version](https://img.shields.io/npm/v/purgeit.svg)](https://www.npmjs.com/package/purgeit)
[![CI](https://github.com/nandan-varma/purgeit/actions/workflows/ci.yml/badge.svg)](https://github.com/nandan-varma/purgeit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Find and delete regenerable dev build artifacts (`node_modules`, `dist`, `target`, `Pods`, ...) across your projects. Interactive TUI by default; scriptable via flags for CI/cron.

📖 **[Full documentation](https://purgeit.nandan.fyi)** — getting started, CLI reference, configuration, built-in rules, architecture, API reference.

## Quick start

```bash
npx purgeit ~/dev
```

> Running `purgeit` in a terminal opens the interactive TUI. For a non-interactive dry-run preview, use `purgeit --headless --dry-run` or `purgeit --json --dry-run`.

## Features

- **Safe by default** — nothing selected, permanent delete only after explicit multi-select + confirm
- **Interactive TUI** — a sortable table (size/type/name/project/path) with live sizes; selection is a full-row color highlight, not just a checkbox
- **Headless mode** — `--json`/`--delete` flags for scripting and CI
- **60+ built-in rules across 16 ecosystems** — JavaScript/TypeScript, Python, Rust, Go, PHP, Ruby, Java/JVM, .NET, Apple/Swift, Elixir, Haskell, Elm, Zig, Dart/Flutter, C/C++, not just `node_modules`. Full list: [purgeit.nandan.fyi/rules](https://purgeit.nandan.fyi/rules/)
- **Configurable rules** — extend, narrow, or replace the defaults with a `purgeit.config.ts`
- **Two scan modes** — projects mode (groups by top-level dir) or flat mode (`--full`)
- **Cross-platform** — works on macOS, Linux, and Windows. On macOS/Linux, uses `du` for fast directory sizing; on Windows, falls back to a pure-Node.js walker

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
      --dry-run              Simulate deletion without touching files. In headless mode this is the default unless --delete is given; in a TTY the TUI still opens and confirmed deletions are simulated.
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
  alwaysSafeRemove: ['coverage'],
  gated: [
    { name: 'generated', when: { file: 'codegen.json' } },
  ],
  targets: {
    frontend: ['node_modules', '.next', 'dist'],
  },
};
```

Config is resolved via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) — searches from cwd upward. Use `--config <path>` to specify explicitly, or `--no-config` for defaults only.

`.js`/`.ts`/`.cjs`/`.mjs` config files are executed as code (same trust model as ESLint/Jest configs) — only run purgeit somewhere you trust the config files that could be found by that upward search.

## Platform notes

- **macOS / Linux** — directory sizes are computed via `du -s -k`, which is fast and matches the behavior of the original CLEANUP.sh script.
- **Windows** — `du` is not available, so sizing uses a pure-Node.js recursive `stat` walk. This is correct but slower for very large trees. The TUI works best in [Windows Terminal](https://aka.ms/terminal); legacy `cmd.exe` may have limited Unicode box-drawing support.
- **WSL** — full Unix environment, behaves identically to Linux.

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
