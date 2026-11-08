# Plan 005: Report inaccessible scan roots accurately

> **Executor instructions**: Follow this plan and do not update
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 87002f3..HEAD -- src/scan/scanner.ts src/scan/scanner.test.ts src/cli/headless.ts src/cli/headless.test.ts README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug, docs, tests
- **Planned at**: commit `87002f3`, 2026-07-22

## Why this matters

The README promises exit code 2 for environment errors, but a nonexistent or
unreadable requested root becomes an empty scan and exit code 1. Scripts cannot
distinguish “nothing to clean” from “the requested directory was wrong.”
Subdirectories that disappear during traversal should remain best-effort; only
the explicit root needs a hard validation boundary.

## Current state

- `src/scan/scanner.ts:78-83` catches failure to `readdir(root)` in projects
  mode and returns empty lists. `src/scan/walk.ts:61-65` similarly suppresses
  read failures.
- `src/scan/scanner.test.ts:160-163` currently codifies an empty done event
  for a nonexistent root.
- `src/cli/headless.ts:95-114` has a scan error boundary that returns 2.
- README exit code documentation is at line 52.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npx vitest run src/scan/scanner.test.ts src/cli/headless.test.ts` | exit 0 |
| Full gates | `npm run typecheck && npm run lint && npm test && npm run build` | exit 0 |

## Scope

**In scope**: `src/scan/scanner.ts`, `src/scan/scanner.test.ts`,
`src/cli/headless.ts`, `src/cli/headless.test.ts`, `README.md`.

**Out of scope**: treating an unreadable nested directory as fatal, changing
the scan event API without necessity, or TUI terminal rendering.

## Steps

### Step 1: Validate the requested root before best-effort traversal

At the scanner or CLI boundary, distinguish failure to access the requested
root from failures reading descendants. Throw or translate a descriptive root
access error so headless execution returns 2 through its existing catch.
Preserve the current best-effort behavior for directories that disappear after
the root check.

**Verify**: `npx vitest run src/scan/scanner.test.ts src/cli/headless.test.ts` → all pass.

### Step 2: Update behavior tests and documentation

Replace the old nonexistent-root success test with assertions for the chosen
error boundary. Add a headless CLI test that verifies exit code 2 and a clear
stderr message for a nonexistent root. Keep README’s exit-code wording only if
the new behavior fulfills it; otherwise revise it precisely.

**Verify**: `npx vitest run src/scan/scanner.test.ts src/cli/headless.test.ts` → all pass.

### Step 3: Run full gates

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0.

## Done criteria

- [ ] A nonexistent requested root is not reported as “Nothing to clean.”
- [ ] Headless CLI returns exit code 2 and a descriptive error.
- [ ] Nested traversal failures remain nonfatal.
- [ ] Full gates pass and only scoped files changed.

## STOP conditions

- Cross-platform behavior makes a reliable root accessibility check impossible
  without a new dependency or public API change.

## Maintenance notes

Keep root validation separate from normal traversal error tolerance; this CLI
is intended to scan imperfect developer trees without failing on every stale
subdirectory.
