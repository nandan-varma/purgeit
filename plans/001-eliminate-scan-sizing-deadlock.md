# Plan 001: Eliminate the scan sizing deadlock

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. Do not update
> `plans/README.md`; the reviewer owns the plan index.
>
> **Drift check (run first)**: `git diff --stat 87002f3..HEAD -- src/scan/scanner.ts src/scan/size.ts src/scan/scanner.test.ts src/scan/size.test.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug, perf, tests
- **Planned at**: commit `87002f3`, 2026-07-22

## Why this matters

`scan()` uses one `p-limit` instance to bound discovery and size work. A size
worker scheduled through that limiter awaits `computeSize()`, which queues the
batched `du` subprocess through the same limiter. Once all slots hold waiting
size workers, no slot remains to start the batch, so the scan never emits
`done`. This is especially reproducible with `--concurrency 1` and makes a
safety tool appear frozen.

## Current state

- `src/scan/scanner.ts` owns scan orchestration. At lines 169–172 it creates
  `limit` and `duBatcher = createDuBatcher(limit)`; at 195–206 each size task
  is submitted through `limit` and awaits `computeSize(..., { batcher })`.
- `src/scan/size.ts` owns `DuBatcher`. At lines 102–115, `flush()` submits
  `runBatch()` through `this.limit`, while callers await promises resolved by
  that batch.
- Tests use real filesystem fixtures in `test/fixtures/build-tmp-tree.ts` and
  must keep `fileParallelism: false`; see `src/scan/scanner.test.ts` for the
  collection pattern. `src/ui/` is the only directory allowed to import React
  or Ink; do not touch it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npx vitest run src/scan/scanner.test.ts src/scan/size.test.ts` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Full tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**: `src/scan/scanner.ts`, `src/scan/size.ts`,
`src/scan/scanner.test.ts`, `src/scan/size.test.ts`.

**Out of scope**: CLI argument semantics, rule matching, delete behavior,
TUI code, and changes to the public `ScanEvent` shape.

## Git workflow

- Branch: `advisor/001-eliminate-scan-sizing-deadlock`.
- Use the repository’s conventional commit style, e.g. `fix: ...`.
- Do not push or open a PR.

## Steps

### Step 1: Separate queued size workers from the batch subprocess capacity

Change the limiter ownership so an in-flight size worker never waits for a
batch that requires a permit held by that same worker. Preserve the documented
bounded-concurrency intent: directory reads and externally spawned `du`
processes must remain bounded, and scans must still stream `found`, then
`size`, then `done`. A simple valid design is a dedicated limiter for batch
subprocesses, distinct from the scan worker limiter; do not remove all limits.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Add a deterministic regression test

In `src/scan/scanner.test.ts`, create a tree with at least two artifact
directories and collect `scan(..., { mode: 'flat', concurrency: 1 })` without
aborting. Assert every found entry receives a size event and exactly one done
event arrives with the summed size. Ensure the test fails on the old cyclic
limiter design; use Vitest timeout only as a diagnostic guard, not as the
assertion itself. If the implementation exposes a batcher construction detail,
add a small focused test in `src/scan/size.test.ts` following its existing
mocked-`execFile` pattern.

**Verify**: `npx vitest run src/scan/scanner.test.ts src/scan/size.test.ts` → all pass.

### Step 3: Run the full repository gates

Do not weaken coverage thresholds or change `vitest.config.ts`.

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0.

## Done criteria

- [ ] A normal scan with `concurrency: 1` and multiple artifacts completes.
- [ ] The implementation retains bounded directory and `du` concurrency.
- [ ] A regression test proves completion and correct size/done events.
- [ ] Full verification command exits 0.
- [ ] Only in-scope files changed.

## STOP conditions

- The drift check changes any in-scope code so the described cyclic limiter is
  no longer present.
- A correct fix needs to alter public scan events or CLI options.
- The regression cannot fail on the old implementation without relying on
  arbitrary sleeps.

## Maintenance notes

Future batching changes must never schedule work on a limiter that all awaiters
currently occupy. Reviewers should specifically trace permit acquisition across
`scanner.ts` and `DuBatcher` before approving concurrency changes.
