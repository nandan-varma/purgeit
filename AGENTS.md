# AGENTS.md

## Verify before committing

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Coverage is enforced at **100%** statements/branches/functions/lines for everything **except `src/ui/**`** and `src/types.ts`. The vitest config (`vitest.config.ts`) enforces this — a `npm run coverage` that falls below the threshold exits non-zero.

## React/ink isolation

`src/ui/` is the **only** directory allowed to import `react` or `ink`. The CI workflow enforces this with a grep check. Keep the rule engine, scanner, config, and CLI core (`src/cli/`) framework-agnostic so they're unit-testable with plain vitest.

## TypeScript gotchas

- **`exactOptionalPropertyTypes: true`** — optional fields fed by `| undefined` values must be declared `field?: T | undefined`, not just `field?: T`. Every options interface in the codebase follows this pattern; match it.
- **`noUncheckedIndexedAccess: true`** — array destructuring produces `T | undefined`. Use `as T` when the value is guaranteed (e.g. regex captures), don't add defensive `??` operators that create unreachable branches.
- **No `rootDir`** — it was removed because `test/fixtures/build-tmp-tree.ts` lives outside `src/`. Don't re-add it.
- **`jsx: "react-jsx"`** — needed for Ink components in `src/ui/`.

## Build (tsup)

Two entry points, built in order:
1. Library (`src/index.ts` → `dist/index.{js,cjs,d.ts}`) — `clean: true`
2. CLI (`src/cli/cli-main.ts` → `dist/cli.js`) — `clean: false`, shebang banner via `banner.js`

**Never put `#!/usr/bin/env node` in source files** — tsup adds it. A duplicate shebang bug was already fixed once.

## Testing

- **Real filesystem fixtures** — `test/fixtures/build-tmp-tree.ts` creates temp dirs via `mkdtempSync`. Don't mock `fs`; use `buildTree()`/`cleanupTree()`.
- **`fileParallelism: false`** — tests spawn real `du` child processes. Parallel file execution exhausts `posix_spawn` on macOS.
- **`vi.mock` for scanner errors** — `scan()` swallows its own errors internally, so its catch block in `headless.ts` is unreachable by default. Test it via `vi.mock('../scan/scanner.js', ...)` in a dedicated test file (`headless-scan-error.test.ts`) with top-level `await import`.
- **Abort timing** — don't rely on inter-project navigation timing for abort tests. Use multiple sibling dirs with `concurrency: 1` for deterministic p-limit queuing (see `scanner.test.ts`).

## Lint

Biome: 2-space indent, single quotes, trailing commas. Run `npm run lint:fix` to auto-fix.

## Conventions from the plan

The full architecture plan is at `/Users/nandan/.claude/plans/encapsulated-cuddling-lighthouse.md`. The handoff doc at `handoff.md` in the repo root captures decisions, gotchas, and the milestone tracker. Read both before making structural changes.
