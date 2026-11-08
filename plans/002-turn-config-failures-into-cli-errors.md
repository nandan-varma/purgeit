# Plan 002: Turn configuration failures into CLI errors

> **Executor instructions**: Follow this plan step by step and do not update
> `plans/README.md`. Stop and report if the current code differs materially.
>
> **Drift check (run first)**: `git diff --stat 87002f3..HEAD -- src/config/schema.ts src/config/validate.test.ts src/cli/cli.ts src/cli/cli.test.ts src/cli/headless.ts src/cli/headless.test.ts src/ui/run-tui.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug, security, tests
- **Planned at**: commit `87002f3`, 2026-07-22

## Why this matters

Configuration is user supplied and should produce a clean usage/environment
error, not an uncaught exception. The schema currently accepts any string for
a declarative grep pattern, but rule compilation calls `new RegExp(pattern)`.
The headless runner only catches loading errors, and `runCli()` awaits the TUI
without an error boundary. A typo therefore can crash either execution path.

## Current state

- `src/config/schema.ts:182-192` validates `grep.file` and `grep.pattern` only
  as strings. `compileGateCondition()` at lines 48–50 constructs a RegExp.
- `src/cli/headless.ts:69-87` catches `loadConfig()` but merges/compiles rules
  outside that `try` block.
- `src/cli/cli.ts:36-82` catches argument and TUI min-size errors, but directly
  returns `runTui()` at line 54; `src/ui/run-tui.ts:33-46` loads and merges
  config without translating exceptions.
- Match `formatErrorMessage()` and the existing exit-code-2 CLI pattern in
  `src/cli/cli.ts:30-33`. Keep the explicit trusted-code config model stated
  in README unchanged.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Config tests | `npx vitest run src/config/validate.test.ts src/cli/cli.test.ts src/cli/headless.test.ts` | exit 0 |
| Full gates | `npm run typecheck && npm run lint && npm test && npm run build` | exit 0 |

## Scope

**In scope**: `src/config/schema.ts`, `src/config/validate.test.ts`,
`src/cli/cli.ts`, `src/cli/cli.test.ts`, `src/cli/headless.ts`,
`src/cli/headless.test.ts`, and `src/ui/run-tui.ts` only if needed to preserve
the existing `runTui(): Promise<number>` contract.

**Out of scope**: arbitrary restrictions on regex syntax, changing config
search behavior, or executing untrusted JS/TS configs differently.

## Steps

### Step 1: Validate declarative regex syntax at the schema boundary

When validating a `grep` condition, construct the RegExp in a guarded check
and throw the same descriptive `TypeError` style with source and gated-rule
name if it is invalid. Preserve `m` compilation semantics used at runtime.
Add a test in `validate.test.ts` for a syntactically invalid pattern.

**Verify**: `npx vitest run src/config/validate.test.ts` → all pass.

### Step 2: Give both CLI modes the same controlled error behavior

Wrap config resolution plus rule merge/restriction in a boundary that emits
`purgeit: <message>` to stderr and returns 2. For forced/automatic TUI mode,
ensure configuration failures are caught by `runCli()` before Ink owns the
terminal. Keep successful TUI dispatch lazy-loaded and preserve injectable
stdout/stderr tests.

Add tests showing invalid config/rule setup returns 2 with a readable message
for headless and TUI dispatch paths; mock the TUI runner as existing CLI tests
do, rather than rendering Ink.

**Verify**: `npx vitest run src/cli/cli.test.ts src/cli/headless.test.ts` → all pass.

### Step 3: Run full gates

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0.

## Done criteria

- [ ] Invalid regex config is rejected before rule merging.
- [ ] Headless and TUI config failures produce exit code 2, not an unhandled rejection.
- [ ] New tests cover both boundaries.
- [ ] Only in-scope files changed and all full gates pass.

## STOP conditions

- Config errors are intentionally surfaced through a public structured error
  API that this plan would bypass.
- Catching TUI errors requires touching Ink components or public CLI flags.

## Maintenance notes

Any new declarative condition with compile-time syntax must validate during
`assertPurgeitUserConfig`, not later in scanning.
