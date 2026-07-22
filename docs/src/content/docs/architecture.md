---
title: Architecture
description: How purgeit is structured under the hood.
---

purgeit is a TypeScript CLI and library. The codebase is split into a framework-agnostic core and an Ink/React TUI layer.

## Module overview

```
src/
├── cli/           # argument parsing, headless orchestration, TUI dispatch
├── config/        # cosmiconfig integration and config validation
├── delete/        # deletion engine with safety guards
├── rules/         # default rules, gates, merge logic, validators
├── scan/          # filesystem walker, size computation, async queue
├── ui/            # Ink-based interactive terminal UI
├── format.ts      # byte formatting and error helpers
├── types.ts       # shared TypeScript interfaces
└── index.ts       # public library API
```

## Core design principles

- **`src/ui/` is the only place that imports React or Ink.** The scanner, rule engine, config loader, and CLI core are framework-agnostic. This keeps the library API testable without rendering anything and is enforced by a CI grep check.
- **Async streaming.** The scanner emits `found`, `size`, `warning`, and `done` events progressively so the UI can render matches as they are discovered and update sizes as they resolve.
- **Bounded concurrency.** Both discovery and sizing use a shared `p-limit` instance (default 8) to avoid exhausting file descriptors or child processes.
- **Real filesystem tests.** Unit tests use temporary directories rather than mocked `fs` calls, so the tests exercise the same code paths used in production.

## Scan flow

1. `scan()` starts an async discovery pass.
2. In `projects` mode, `listProjects()` enumerates immediate children, identifies which are projects, and runs manifest validators.
3. `walk()` descends each project tree, matching directory names against the ruleset.
4. Always-safe matches stop the walk; gated matches are reported only when the gate predicate passes.
5. Each reported match is sized by `computeSize()`, which batches `du` calls on Unix and falls back to a pure-Node walk on Windows.
6. Events are streamed to the consumer via an `AsyncQueue`.

## Rule engine

A `ResolvedRuleSet` contains:

- `alwaysSafe`: directories that are always deletable (e.g. `node_modules`).
- `gated`: directories that are only deletable when a sibling condition is met (e.g. `build` next to a `package.json`).
- `skipDirs`: directories that are never descended into.
- `pruneMeta`: directories treated like VCS metadata (e.g. `.git`).
- `targets`: named groups of rule names.

User configs are merged with the built-in ruleset via `mergeRuleSets()`, then CLI flags (`--no-gated`, `--targets`) are applied via `applyCliFilters()`.

## Deletion

`deleteEntries()` is the last line of defense. It refuses to delete the filesystem root or the user's home directory, supports dry-run mode, and continues past individual failures while aggregating counts in the final `done` event.
