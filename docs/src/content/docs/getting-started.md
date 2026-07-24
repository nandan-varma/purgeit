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

purgeit ships with 60+ built-in rules across 16 ecosystems — not just JavaScript. A sample:

- **JavaScript/TypeScript**: `node_modules`, `dist`, `.next`, `.nuxt`, `.turbo`, `.vite`, `coverage`, and more
- **Python**: `__pycache__`, `.venv`, `.tox`, `.pytest_cache`, `.mypy_cache`, `htmlcov`, and more
- **Rust**, **Go**, **PHP**, **Ruby**, **Elixir**, **Haskell**, **Elm**, **Zig**, **Dart/Flutter**
- **Apple**: `DerivedData`, `.build` (SPM), `Pods` (CocoaPods), `Carthage`
- **Java/JVM**: `.gradle`, `target` (Maven), `.cxx` (Android NDK)
- **.NET**: `bin`, `obj` (also covers Eclipse Java)
- Gated directories — matched only when a sibling manifest proves they're real generated output, e.g. `Pods/` only next to a `Podfile`, `vendor/` only next to a `composer.json`, `go.mod`, `Cargo.toml`, or `Gemfile`

Every one of these is rendered live, with descriptions and gate conditions, on the [built-in rules reference](/rules/) — generated directly from the same source the scan engine compiles against, so it can't go stale. You can extend, narrow, or replace the ruleset with a [configuration file](/configuration/).

## Next steps

- [Interactive TUI](/tui/) — full keymap and workflow for the default terminal experience
- [CLI reference](/cli/) — every flag, exit codes, and headless/scripting examples
- [Configuration](/configuration/) — customize the ruleset with `purgeit.config.ts`
- [API reference](/api/) — use the scanner and rule engine as a library in your own tools
