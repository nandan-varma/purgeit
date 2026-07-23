---
title: Getting started
description: Install purgeit and run your first cleanup.
---

## Installation

Run `purgeit` directly with `npx`:

```bash
npx purgeit ~/dev
```

Or install it globally:

```bash
npm install -g purgeit
purgeit ~/dev
```

## First run

In a terminal, `purgeit` opens an interactive TUI:

```bash
purgeit ~/dev
```

Every row starts unselected. Use the keyboard to navigate, select artifacts, and delete them after an explicit confirmation — see the [Interactive TUI reference](/tui/) for the full keymap (also available in-app by pressing <kbd>?</kbd>).

For a non-interactive dry-run preview, use headless mode:

```bash
purgeit --headless --dry-run ~/dev
```

Or emit JSON for downstream tools:

```bash
purgeit --json --dry-run ~/dev
```

## What gets cleaned

By default, purgeit matches the most common regenerable directories:

- `node_modules`, `dist`, `.next`, `.nuxt`, `out`, `target`
- Framework caches: `.cache`, `.vite`, `.turbo`, `.swc`, `.angular`, `.svelte-kit`, `.astro`
- Test artifacts: `coverage`, `.nyc_output`, `playwright-report`, `test-results`
- Python artifacts: `__pycache__`, `.venv`, `.tox`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`
- Gated directories (only when a sibling manifest exists): `Pods`, `build`, `.gradle`, `bin`, `obj`

See the full [built-in rules reference](/rules/) for the complete list and gate conditions. You can extend or replace these rules with a [configuration file](/configuration/).

## Next steps

- [Interactive TUI](/tui/) — full keymap and workflow for the default terminal experience
- [CLI reference](/cli/) — every flag, exit codes, and headless/scripting examples
- [Configuration](/configuration/) — customize the ruleset with `purgeit.config.ts`
- [API reference](/api/) — use the scanner and rule engine as a library in your own tools
