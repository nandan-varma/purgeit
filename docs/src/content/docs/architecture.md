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

- **`src/ui/` is the only place that imports React or Ink.** The scanner, rule engine, config loader, and CLI core are framework-agnostic. This keeps the library API ([see the reference](/api/)) testable without rendering anything, usable independently of the TUI, and is enforced by a CI grep check.
- **Async streaming.** The scanner emits `found`, `size`, `warning`, and `done` events progressively (see [`scan()`](/api/#scan)) so the UI can render matches as they are discovered and update sizes as they resolve, rather than waiting for the whole tree to be walked.
- **Bounded, non-competing concurrency.** Directory reads and per-match size scheduling share one `p-limit` instance (default 8, tunable via `--concurrency`) to avoid exhausting file descriptors or child processes. The batched `du` invocations underneath run on their *own separate* limiter — sharing one would let every slot end up held by a task blocked waiting for the batch that itself needs a slot to run, deadlocking any scan with more matches than the concurrency limit.
- **Real filesystem tests.** Unit tests use temporary directories (`test/fixtures/build-tmp-tree.ts`) rather than mocked `fs` calls, so the tests exercise the same code paths used in production.

## Scan flow

1. `scan()` starts an async discovery pass.
2. In `projects` mode (the default), `listProjects()` enumerates the root's immediate children, identifies which are projects, and runs manifest validators (e.g. flags a corrupted `package.json`). `flat` mode (`--full`) skips this and treats the whole root as one scan unit.
3. `walk()` descends each project tree, matching directory names against the ruleset. Sibling directories are read concurrently rather than one at a time, so a wide tree of many projects doesn't pay for discovery serially.
4. Always-safe matches stop the walk there (no point looking for `node_modules` inside `node_modules`); gated matches are reported only when the gate predicate passes, and also stop the walk either way.
5. Each reported match is sized by `computeSize()`, which batches `du -s -k` calls on macOS/Linux (reducing process-fork overhead from O(n) to O(n/32)) and falls back to a concurrency-limited pure-Node recursive walk on Windows, or wherever `du` is unavailable or fails on a specific path.
6. Events are streamed to the consumer via an `AsyncQueue` bridging the concurrent producers into one ordered async generator.

## Rule engine

A `ResolvedRuleSet` contains:

- `alwaysSafe`: directories that are always deletable (e.g. `node_modules`).
- `gated`: directories that are only deletable when a sibling condition is met (e.g. `build` next to a `package.json`).
- `skipDirs`: directories that are never descended into.
- `pruneMeta`: directories treated like VCS metadata (e.g. `.git`).
- `targets`: named groups of rule names.

User configs are merged with the built-in ruleset via `mergeRuleSets()`, then CLI flags (`--no-gated`, `--targets`) are applied via `applyCliFilters()`. See [Configuration](/configuration/) for the user-facing shape and [Built-in rules](/rules/) for what ships by default.

### The rule catalog

The built-in rules themselves live in `src/rules/catalog/` — one file per ecosystem, each exporting a plain array of `RuleDefinition`s (name, kind, ecosystem categories, human-readable description, and — for gated rules — a declarative `when` condition using the exact same `GateCondition` shape `purgeit.config.ts` uses). `default-rules.ts` derives `ALWAYS_SAFE_NAMES`/`GATED_NAMES`/`PRUNE_META_NAMES` from this catalog by filtering on `kind`; `gate-conditions.ts` derives the compiled `Gate` map by running each gated rule's `when` through the same `compileGateConditions()` a user config's declarative gates go through. Nothing scan-relevant is hand-duplicated between the catalog and the engine that consumes it.

This exists so the rule *data* and the rule *matching logic* can't drift apart, and so the same data is usable outside the scan engine — `RULE_CATALOG` is exported from the public API (see [API reference](/api/#rule-catalog)), and [`/rules/`](/rules/) renders it directly rather than hand-maintaining a table that could go stale (which happened once: `.build` was documented as a Python artifact when it's actually Swift Package Manager's). Adding an ecosystem is mechanical: a new `catalog/<name>.ts` file, one line adding it to `catalog/index.ts`'s aggregation, and a new `RuleCategory` member in `catalog/types.ts` if needed.

## Safety model

Safety is layered at every stage, not just at the final delete call:

1. **Matching is conservative by construction.** A directory name is only ever a candidate if it's in the unconditionally-safe list or passes a gate predicate proving a sibling manifest exists — there's no heuristic "looks like build output" guessing.
2. **Nothing is ever deleted without explicit human action.** In the [TUI](/tui/), every row starts unselected, and deletion is only reachable through a dedicated confirming phase requiring an explicit select-then-confirm. Headless mode requires `--delete`, and prompts for confirmation unless `--yes` is also passed.
3. **`deleteEntries()` is the last line of defense**, independent of whatever the rule engine matched: it refuses to delete the filesystem root or the current user's home directory outright, supports `--dry-run` to simulate the entire deletion flow with nothing touched on disk, and continues past individual failures (permission denied, path vanished) rather than aborting the whole batch — failures are aggregated into the final `done` event instead of taking down the run.
