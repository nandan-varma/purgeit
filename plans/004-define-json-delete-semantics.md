# Plan 004: Define combined JSON and delete behavior

> **Executor instructions**: Follow this plan step by step and do not update
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 87002f3..HEAD -- src/cli/args.ts src/cli/args.test.ts src/cli/headless.ts src/cli/headless.test.ts README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-eliminate-scan-sizing-deadlock.md`
- **Category**: bug, docs, tests
- **Planned at**: commit `87002f3`, 2026-07-22

## Why this matters

`--json` promises machine-readable output and `--delete` promises deletion,
but both flags are accepted together. The JSON branch returns before the
deletion branch, silently turning a requested delete into a preview. For a
destructive CLI, ambiguity must be explicit and safely fail rather than
silently doing less than automation requested.

## Current state

- `src/cli/args.ts:96-103` parses both `delete` and `json` without a conflict
  check; it already rejects analogous incompatible flag pairs at lines 124–131.
- `src/cli/headless.ts:129-149` emits JSON and returns before line 162 begins
  delete handling.
- README labels `--delete` “Actually delete” and `--json` “Machine-readable
  JSON output” at lines 40–43, but does not define their combination.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Args tests | `npx vitest run src/cli/args.test.ts src/cli/headless.test.ts` | exit 0 |
| Full gates | `npm run typecheck && npm run lint && npm test && npm run build` | exit 0 |

## Scope

**In scope**: `src/cli/args.ts`, `src/cli/args.test.ts`, `src/cli/headless.ts`,
`src/cli/headless.test.ts`, `README.md`.

**Out of scope**: designing a streamed JSON deletion protocol, changing
default deletion confirmation, or TUI behavior.

## Steps

### Step 1: Reject the ambiguous destructive combination

Add `--json` plus `--delete` to `parseCliArgs()`’s mutually exclusive flag
validation. Use a clear error naming both flags. This is safer and smaller
than inventing an undocumented JSON deletion schema.

**Verify**: `npx vitest run src/cli/args.test.ts` → all pass.

### Step 2: Lock down the user-facing contract

Add a parser/CLI test proving the combined flags return usage error 2 and do
not call deletion. Amend the README flag documentation to state they cannot
be combined and that JSON is scan output only.

**Verify**: `npx vitest run src/cli/args.test.ts src/cli/headless.test.ts` → all pass.

### Step 3: Run full gates

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0.

## Done criteria

- [ ] `purgeit --json --delete` fails before scanning/deleting with exit 2.
- [ ] README states the restriction.
- [ ] Tests prove deletion cannot be skipped silently.
- [ ] Full gates pass and only scoped files changed.

## STOP conditions

- The project already has a versioned JSON action-result schema that supports
  deletion and makes rejecting the combination a breaking regression.

## Maintenance notes

If JSON deletion support is later wanted, introduce a documented versioned
result schema and integration tests rather than silently changing this rule.
