# AGENTS.md

```bash
npm run typecheck && npm run lint && npm test && npm run build   # verify before committing
npx vitest run src/clean/clean.test.ts                           # one file
npx vitest run -t "name"                                          # by name
npm run schema                                                    # regenerate purgeit.schema.json
```

## Rules of the road

- **Safety is the product.** Deletion goes through `clean()` → `inspect()` (`src/clean/guard.ts`) only. Never add a delete path that skips it, and never weaken a guard to make a test pass.
- **Rules are data.** Matching logic lives in `src/rules/` as declarative conditions; no function-valued rules.
- **One door to the filesystem for traversal:** the `Io` interface (`src/fs/io.ts`). Calls are deliberately unthrottled (libuv's pool is the bound — measured faster).
- **Only `src/tui/` imports `react`/`ink`.** Keys are interpreted in the reducer (`src/tui/state.ts`), never in the input handler, so fast input cannot hit a stale closure.
- **Errors:** user-fixable problems throw `PurgeitError` (printed plainly, exit 2). Routine filesystem errors (`ENOENT`, `EACCES`, …) are skipped *and counted*; anything else propagates.
- **Tests:** real temp trees from `test/tree.ts`; never touch shared dirs. History is only written when `historyFile` is passed, so tests don't need env switches.
- Config changes need `npm run schema`.
