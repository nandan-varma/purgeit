# Plan 003: Restore the lint verification gate

> **Executor instructions**: Follow this plan and do not update
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 87002f3..HEAD -- src/scan/size.test.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `87002f3`, 2026-07-22

## Why this matters

The documented required verification command includes `npm run lint`, but it
currently fails solely because imports in one test are not Biome-organized.
Restoring the green baseline prevents every unrelated change from appearing to
fail repository validation.

## Current state

`src/scan/size.test.ts:1-3` imports Vitest before Node and package imports.
`npm run lint` reports `assist/source/organizeImports` and supplies a safe
ordering. This repository uses Biome check mode; do not disable or weaken it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `npm run lint` | exit 0 |
| Focused tests | `npx vitest run src/scan/size.test.ts` | exit 0 |

## Scope

**In scope**: `src/scan/size.test.ts` only.

**Out of scope**: Biome configuration, lint scripts, source behavior, and any
formatting of unrelated files.

## Steps

### Step 1: Apply the existing import-order requirement

Reorder only the import declarations in `src/scan/size.test.ts` to satisfy
Biome’s reported ordering: Node built-ins, package imports, then test imports.
Do not modify test bodies.

**Verify**: `npm run lint && npx vitest run src/scan/size.test.ts` → exit 0.

## Done criteria

- [ ] `npm run lint` exits 0.
- [ ] The focused test passes.
- [ ] Diff contains only import reordering in the one scoped file.

## STOP conditions

- Lint reports unrelated diagnostics after this change; report those rather
  than broadening the scope.

## Maintenance notes

Keep imports organized when adding mocks or helpers to this test file.
