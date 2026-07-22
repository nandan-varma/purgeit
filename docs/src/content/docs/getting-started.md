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

Use the keyboard to navigate, select artifacts, and delete them after confirming.

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

## Exit codes

- `0` — success
- `1` — nothing found or deletion had failures
- `2` — usage or environment error
