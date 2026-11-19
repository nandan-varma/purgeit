# Plan 001: Eliminate all v8 ignore statements through shared utility, dead-code cleanup, and pragmatic coverage thresholds

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f0aabcd..HEAD -- src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `f0aabcd`, 2026-07-21

## Why this matters

The codebase has 13 `/* v8 ignore ... */` suppression comments across 6 files. These exist because:

1. TypeScript's `unknown` catch type forces `err instanceof Error` guards, creating V8 coverage branches that V8 can't prove covered (the error paths are genuinely unreachable by design)
2. Some are legitimately defensive code for typescript-compiler and dependency edge cases
3. One is a static invariant that runs at module load time

The 100% branch coverage threshold (`vitest.config.ts:20`) makes it impossible to remove these without either testing genuinely unreachable code or lowering the threshold. The fix: extract a shared error formatter (removing 5 duplicate catch patterns), clean up dead code, and adopt a 95% threshold — enough to catch real regressions while accepting that defensive/unreachable code by design doesn't need 100% branch coverage.

## Current state

### The 13 v8 ignore statements

**Group A — Duplicate error formatting in catch blocks (5 instances):**

All follow the same pattern: `catch (err) { /* v8 ignore */ stderr(\`purgeit: ${err instanceof Error ? err.message : String(err)}\`); return 2; }`

| File:Line                 | Function      | What's being caught                                       |
| ------------------------- | ------------- | --------------------------------------------------------- |
| `src/cli/cli.ts:31`       | `runCli`      | `parseCliArgs` (always throws `Error`)                    |
| `src/cli/cli.ts:47`       | `runCli`      | `parseSizeString` (always throws `Error`)                 |
| `src/cli/headless.ts:64`  | `runHeadless` | `parseSizeString` (always throws `Error`)                 |
| `src/cli/headless.ts:78`  | `runHeadless` | `loadConfig` (always throws `Error`)                      |
| `src/cli/headless.ts:114` | `runHeadless` | `scan()` iterator (always yields Error-compatible events) |

Current duplicated code pattern (cli.ts:31):

```typescript
  } catch (err) {
    /* v8 ignore next -- defensive; parseArgs always throws Error */
    stderr(`purgeit: ${err instanceof Error ? err.message : String(err)}`);
    stderr(`\n${USAGE}`);
    return 2;
  }
```

**Group B — Empty catch body (1 instance):**

`src/scan/scanner.ts:201-203`:

```typescript
      /* v8 ignore start -- defensive; computeSize falls back to JS walk which never throws */
      } catch {
      /* v8 ignore stop */
```

**Group C — Dead default/unreachable branches (3 instances in `src/scan/size.ts`):**

1. Line 58 — `DuBatcher` constructor fallback:

   ```typescript
   /* v8 ignore next -- unreachable; createDuBatcher always provides limit */
   this.limit = opts.limit ?? pLimit(8);
   ```

2. Lines 150-156 — batch fallback:

   ```typescript
   /* v8 ignore start -- defensive; computeSizeFallback catches all fs errors internally */
   try {
     resolve(await computeSizeFallback(path, 8));
   } catch (err) {
     reject(err instanceof Error ? err : new Error(String(err)));
   }
   /* v8 ignore stop */
   ```

3. Line 179 — noUncheckedIndexedAccess workaround:
   ```typescript
   /* v8 ignore next -- String.split never returns an empty array ... */
   const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
   ```

**Group D — Static invariant (1 instance):**

`src/rules/merge.ts:26-29`:

```typescript
for (const name of GATED_NAMES) {
  /* v8 ignore next 3 -- static invariant over hardcoded data; never actually false */
  if (!DEFAULT_GATES.has(name)) {
    throw new Error(`purgeit: GATED_NAMES entry '${name}' has no matching gate in DEFAULT_GATES`);
  }
}
```

**Group E — Defensive dependency import (1 instance):**

`src/config/resolve.ts:27`:

```typescript
/* v8 ignore next -- defensive; the named export always exists in the published package */
tsLoaderCache = (mod.TypeScriptLoader ?? mod.default)();
```

### Repo conventions

- **Verify command**: `npm run typecheck && npm run lint && npm test && npm run build`
- **Coverage config**: `vitest.config.ts` — provider: v8, thresholds: 100% statements/branches/functions/lines, excludes `src/ui/**` and `src/types.ts`
- **Error handling**: catch blocks narrow `unknown` via `err instanceof Error ? err.message : String(err)`
- **tsconfig strict flags**: `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`

## Commands you will need

| Purpose     | Command                                                          | Expected on success |
| ----------- | ---------------------------------------------------------------- | ------------------- |
| Typecheck   | `npm run typecheck`                                              | exit 0, no errors   |
| Lint        | `npm run lint`                                                   | exit 0              |
| Tests       | `npm test`                                                       | all pass            |
| Build       | `npm run build`                                                  | exit 0              |
| Full verify | `npm run typecheck && npm run lint && npm test && npm run build` | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/format.ts` (add `formatErrorMessage` utility)
- `src/format.test.ts` (add tests for the utility)
- `src/cli/cli.ts` (use shared utility, remove 2 v8 ignores)
- `src/cli/headless.ts` (use shared utility, remove 3 v8 ignores)
- `src/scan/size.ts` (remove dead default, remove 3 v8 ignores)
- `src/scan/scanner.ts` (remove 1 v8 ignore)
- `src/rules/merge.ts` (remove 1 v8 ignore)
- `src/config/resolve.ts` (remove 1 v8 ignore)
- `vitest.config.ts` (lower coverage threshold from 100% to 95%)
- `CLAUDE.md` (update coverage threshold documentation)

**Out of scope** (do NOT touch):

- `src/ui/**` — already exempt from coverage thresholds
- `src/types.ts` — already exempt from coverage thresholds
- `test/fixtures/build-tmp-tree.ts` — test utility, unchanged
- Any new feature work or architectural changes

## Git workflow

- Branch: main (or `advisor/001-eliminate-v8-ignore`)
- Commit per logical step; message style: conventional commits (see `git log --oneline -10`)
- Do NOT push or open a PR unless instructed

## Steps

### Step 1: Add `formatErrorMessage` utility to `src/format.ts`

Add a single exported function at the bottom of `src/format.ts` (after the existing `formatBytes` function):

```typescript
/**
 * Narrow an `unknown` caught value to a displayable error message.
 * Use in catch blocks where the caught value is `unknown`:
 * `catch (err) { stderr(formatErrorMessage(err)); return 2; }`
 */
export function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: Write tests for `formatErrorMessage` in `src/format.test.ts`

Append a new `describe` block to the existing `src/format.test.ts` file (after the existing `describe('formatBytes', ...)` block):

```typescript
describe('formatErrorMessage', () => {
  it('returns message from an Error instance', () => {
    expect(formatErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error value', () => {
    expect(formatErrorMessage('raw string')).toBe('raw string');
  });

  it('stringifies null', () => {
    expect(formatErrorMessage(null)).toBe('null');
  });

  it('stringifies undefined', () => {
    expect(formatErrorMessage(undefined)).toBe('undefined');
  });
});
```

**Verify**: `npx vitest run src/format.test.ts` → all pass (including new tests)

### Step 3: Refactor `src/cli/cli.ts` to use `formatErrorMessage` and remove v8 ignores

Add the import (add `formatErrorMessage` to the existing `../format.js` import):

```typescript
import { formatErrorMessage, parseSizeString } from '../format.js';
```

Replace the two catch blocks:

**Before (cli.ts:30-35):**

```typescript
  } catch (err) {
    /* v8 ignore next -- defensive; parseArgs always throws Error */
    stderr(`purgeit: ${err instanceof Error ? err.message : String(err)}`);
    stderr(`\n${USAGE}`);
    return 2;
  }
```

**After:**

```typescript
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    stderr(`\n${USAGE}`);
    return 2;
  }
```

**Before (cli.ts:46-50):**

```typescript
      } catch (err) {
        /* v8 ignore next -- defensive; parseSizeString always throws Error */
        stderr(`purgeit: ${err instanceof Error ? err.message : String(err)}`);
        return 2;
      }
```

**After:**

```typescript
      } catch (err) {
        stderr(`purgeit: ${formatErrorMessage(err)}`);
        return 2;
      }
```

**Verify**: `npm run typecheck && npx vitest run src/cli/cli.test.ts` → exit 0, all pass

### Step 4: Refactor `src/cli/headless.ts` to use `formatErrorMessage` and remove v8 ignores

Add `formatErrorMessage` to the existing `../format.js` import:

```typescript
import { formatBytes, formatErrorMessage, parseSizeString } from '../format.js';
```

Replace the three catch blocks:

**Before (headless.ts:63-67):**

```typescript
    } catch (err) {
      /* v8 ignore next -- defensive; parseSizeString always throws Error */
      stderr(`purgeit: ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
```

**After:**

```typescript
    } catch (err) {
      stderr(`purgeit: ${formatErrorMessage(err)}`);
      return 2;
    }
```

**Before (headless.ts:77-81):**

```typescript
  } catch (err) {
    /* v8 ignore next -- defensive; cosmiconfig always throws Error */
    stderr(`purgeit: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
```

**After:**

```typescript
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
```

**Before (headless.ts:113-117):**

```typescript
  } catch (err) {
    /* v8 ignore next -- defensive; scan iterator always yields Error-compatible events */
    stderr(`purgeit: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
```

**After:**

```typescript
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
```

**Verify**: `npm run typecheck && npx vitest run src/cli/headless.test.ts src/cli/headless-scan-error.test.ts` → exit 0, all pass

### Step 5: Clean up dead code in `src/scan/size.ts` and remove v8 ignores

**5a.** Remove the dead default in `DuBatcher` constructor (line 58):

**Before:**

```typescript
/* v8 ignore next -- unreachable; createDuBatcher always provides limit */
this.limit = opts.limit ?? pLimit(8);
```

**After:**

```typescript
this.limit = opts.limit;
```

Note: `createDuBatcher(limit)` always passes `limit`, so the `?? pLimit(8)` is dead code. The opts type still accepts optional `limit` — the fallback just isn't needed.

**5b.** Remove the v8 ignore around the `?? ''` on line 179:

**Before:**

```typescript
/* v8 ignore next -- String.split never returns an empty array, so index 0 always exists at runtime; the `?? ''` only satisfies noUncheckedIndexedAccess */
const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
```

**After:**

```typescript
const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
```

The `?? ''` is necessary for `noUncheckedIndexedAccess` (satisfies the compiler; dead code at runtime). The comment is removed; the code speaks for itself.

**5c.** Remove the v8 ignore around the batch fallback (lines 150-156):

**Before:**

```typescript
const bytes = parsed.get(path);
if (bytes !== undefined) {
  resolve(bytes);
} else {
  // Path not in du output (permission denied, vanished, etc.) — fall back to JS.
  /* v8 ignore start -- defensive; computeSizeFallback catches all fs errors internally */
  try {
    resolve(await computeSizeFallback(path, 8));
  } catch (err) {
    reject(err instanceof Error ? err : new Error(String(err)));
  }
  /* v8 ignore stop */
}
```

**After:**

```typescript
const bytes = parsed.get(path);
if (bytes !== undefined) {
  resolve(bytes);
} else {
  // Path not in du output (permission denied, vanished, etc.) — fall back to JS.
  try {
    resolve(await computeSizeFallback(path, 8));
  } catch (err) {
    reject(err instanceof Error ? err : new Error(String(err)));
  }
}
```

The try/catch is genuinely defensive — `computeSizeFallback` catches all fs errors internally, but the catch is a last-resort safety net. It stays; the suppression is removed.

**Verify**: `npm run typecheck && npx vitest run src/scan/size.test.ts` → exit 0, all pass

### Step 6: Remove v8 ignore from `src/scan/scanner.ts`

**Before (scanner.ts:200-204):**

```typescript
      try {
        if (signal?.aborted) return;
        const bytes = await computeSize(match.path, { batcher: duBatcher });
        totalBytes += bytes;
        queue.push({ type: 'size', path: match.path, bytes });
      /* v8 ignore start -- defensive; computeSize falls back to JS walk which never throws */
      } catch {
      /* v8 ignore stop */
      } finally {
```

**After:**

```typescript
      try {
        if (signal?.aborted) return;
        const bytes = await computeSize(match.path, { batcher: duBatcher });
        totalBytes += bytes;
        queue.push({ type: 'size', path: match.path, bytes });
      } catch {
      } finally {
```

The empty catch is intentional: `computeSize` falls back to a pure-Node walk that internally catches all fs errors, so the catch is unreachable by design. Removing the suppression lets V8 coverage mark it as uncovered — acceptable under the 95% threshold.

**Verify**: `npm run typecheck && npx vitest run src/scan/scanner.test.ts` → exit 0, all pass

### Step 7: Remove v8 ignore from `src/rules/merge.ts`

**Before (merge.ts:25-30):**

```typescript
for (const name of GATED_NAMES) {
  /* v8 ignore next 3 -- static invariant over hardcoded data; never actually false */
  if (!DEFAULT_GATES.has(name)) {
    throw new Error(`purgeit: GATED_NAMES entry '${name}' has no matching gate in DEFAULT_GATES`);
  }
}
```

**After:**

```typescript
for (const name of GATED_NAMES) {
  if (!DEFAULT_GATES.has(name)) {
    throw new Error(`purgeit: GATED_NAMES entry '${name}' has no matching gate in DEFAULT_GATES`);
  }
}
```

This is a module-load assertion — always true because both arrays are hardcoded in the same module. V8 can't cover it because it never fails; acceptable under the 95% threshold.

**Verify**: `npm run typecheck && npx vitest run src/rules/merge.test.ts` → exit 0, all pass

### Step 8: Remove v8 ignore from `src/config/resolve.ts`

**Before (resolve.ts:27-28):**

```typescript
/* v8 ignore next -- defensive; the named export always exists in the published package */
tsLoaderCache = (mod.TypeScriptLoader ?? mod.default)();
```

**After:**

```typescript
tsLoaderCache = (mod.TypeScriptLoader ?? mod.default)();
```

The `?? mod.default` is a defensive fallback for edge-case bundler/import scenarios. It stays; the suppression is removed. Acceptable under the 95% threshold.

**Verify**: `npm run typecheck && npx vitest run src/config/resolve.test.ts` → exit 0, all pass

### Step 9: Lower coverage threshold in `vitest.config.ts`

**Before (vitest.config.ts:20):**

```typescript
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
```

**After:**

```typescript
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
```

Rationale: 95% is still a high bar that catches real regressions. It gives headroom for:

- Defensive catch blocks unreachable by design (scanner.ts empty catch)
- Module-load invariants (merge.ts GATED_NAMES check)
- Dead defaults for TypeScript type satisfaction (size.ts `?? ''`)

**Verify**: `npm run coverage` → exit 0, all thresholds met

### Step 10: Update documentation

In `CLAUDE.md` line 25, change:

> Coverage is enforced at **100%** statements/branches/functions/lines

to:

> Coverage is enforced at **95%** statements/branches/functions/lines

**Verify**: Full verify — `npm run typecheck && npm run lint && npm test && npm run build` → exit 0

## Test plan

- New tests: `formatErrorMessage` in `src/format.test.ts` — 4 test cases (Error instance, raw string, null, undefined)
- Existing tests that must still pass: `src/cli/cli.test.ts`, `src/cli/headless.test.ts`, `src/cli/headless-scan-error.test.ts`, `src/scan/size.test.ts`, `src/scan/scanner.test.ts`, `src/rules/merge.test.ts`, `src/config/resolve.test.ts`
- Verification: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; `formatErrorMessage` tests exist and pass
- [ ] `npm run build` exits 0
- [ ] `grep -rn "v8 ignore" src/` returns **no matches** (all 13 suppressions removed)
- [ ] `grep -rn "formatErrorMessage" src/` returns matches in `format.ts`, `cli.ts`, `headless.ts`, and `format.test.ts`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] Coverage thresholds pass at 95%

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- `npm run coverage` shows coverage below 95% after the threshold change (would indicate a real coverage regression, not just the expected uncovering of defensive paths).
- `formatErrorMessage` causes a TypeScript error due to the `exactOptionalPropertyTypes: true` or `noUncheckedIndexedAccess: true` tsconfig flags.

## Maintenance notes

- **Future catch blocks**: Use `formatErrorMessage(err)` instead of the inline `err instanceof Error ? err.message : String(err)` pattern. This keeps error formatting centralized and avoids reintroducing `v8 ignore` suppressions.
- **Coverage threshold**: If new defensive code paths are added and coverage drops below 95%, add targeted tests before lowering the threshold further. 95% is the floor.
- **v8 ignore statements**: Do not reintroduce `/* v8 ignore */` comments. If a new code path can't be covered, document why in a code comment (without the suppression) and ensure the overall threshold still passes.
- **The `?? ''` in size.ts:179**: This is a TypeScript `noUncheckedIndexedAccess` workaround — the `??` is dead code at runtime but required by the strict tsconfig. Don't remove it; don't add a `v8 ignore` for it.
