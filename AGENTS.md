# AGENTS.md

## Verify before committing

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Run a single test: `npx vitest run src/rules/merge.test.ts`
Run by name: `npx vitest run -t "test name substring"`

## Hard-earned gotchas

- **`src/ui/` isolation** — only directory allowed to import `react`/`ink`. CI enforces with grep. Keep rule engine, scanner, config, CLI core framework-agnostic.
- **`exactOptionalPropertyTypes: true`** — optional fields fed by `| undefined` must be `field?: T | undefined`, not `field?: T`.
- **`noUncheckedIndexedAccess: true`** — use `as T` for guaranteed values (e.g. regex captures after a successful match). Don't add `??` that creates unreachable branches.
- **No `rootDir`** — removed because `test/fixtures/build-tmp-tree.ts` lives outside `src/`. Don't re-add.
- **Never put `#!/usr/bin/env node` in source files** — tsup's `banner.js` adds it. A duplicate shebang bug was already fixed once.
- **`fileParallelism: false`** (`vitest.config.ts`) — tests spawn real `du` child processes. Parallel file execution exhausts `posix_spawn` on macOS.
- **Abort timing in tests** — don't rely on inter-project navigation timing for abort tests. Use multiple sibling dirs with `concurrency: 1` for deterministic p-limit queuing (see `scanner.test.ts`).
- **`scan()` swallows its own errors** — its catch block in `headless.ts` is unreachable by default. Test it via `vi.mock('../scan/scanner.js', ...)` in a dedicated file with top-level `await import` (see `headless-scan-error.test.ts`).
- **Sort comparator coverage** — `Array.prototype.sort` on length-2 arrays calls the comparator exactly once in original order. To test both sides of a null-coalescing expression, you need two test files with swapped entry order (see `headless-null-size.test.ts` / `headless-null-size-reverse.test.ts`).
- **Biome suppression placement** — `// biome-ignore` must be adjacent to the line the diagnostic anchors to (e.g. for `useExhaustiveDependencies` that's the `useEffect(() => {` line, not the closing `}, [deps])`).
