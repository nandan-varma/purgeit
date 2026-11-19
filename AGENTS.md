# AGENTS.md

```bash
bun install                 # also installs git hooks (lefthook)
bun run check               # the whole gate: fmt, oxlint, tsgo, knip, tests+coverage, build, publint, attw
bun run test                # vitest (runs on Node)
bunx vitest run src/clean/clean.test.ts      # one file
bun fmt                     # format (Bun's built-in formatter; config in bunfig.toml)
bun run doctor              # React Doctor on src/tui (must stay at 100)
bun run generate            # regenerate purgeit.schema.json and docs/src/generated/* (after changing the config schema, CLI options or rule catalog)
```

## Rules of the road

- **Safety is the product.** Deletion goes through `clean()` → `inspect()` (`src/clean/guard.ts`) only. Never add a delete path that skips it, and never weaken a guard to make a test pass.
- **Rules are data.** Matching logic lives in `src/rules/` as declarative conditions; no function-valued rules.
- **Filesystem access for traversal goes through `src/fs/io.ts`** (`listDir`, `statEntry`). Calls are deliberately unthrottled: libuv's pool is the bound, and a JS limiter measured slower.
- **Only `src/tui/` imports `react`/`ink`.** Keys are interpreted in the reducer (`src/tui/state.ts`), never in the input handler, so fast input cannot hit a stale closure. No ref reads during render; effects that stream must check `signal.aborted` before dispatching.
- **Errors:** user-fixable problems throw `PurgeitError` (printed plainly, exit 2). Routine filesystem errors (`ENOENT`, `EACCES`, …) are skipped _and counted_; anything else propagates. Use `errorMessage`/`errorCode` instead of casting to `Error`.
- **No `as` casts to silence types** (oxlint's `no-unsafe-type-assertion` is on); narrow properly or justify with a disable comment.
- **Tests:** real temp trees from `test/tree.ts`; never touch shared dirs. Assert paths with `rel()`, never with literal `/`. Don't hard-code sizes: allocated sizes depend on the filesystem. History is only written when `historyFile` is passed.
- Piping output (`| head`) must exit quietly (handled in `src/cli/main.ts`).

## The docs site (`docs/`)

A [Fumadocs](https://fumadocs.dev) app on Next.js with its **own** dependencies (npm, `docs/package-lock.json`). It never imports from `src/`: everything derived from the code (CLI options, rule catalog, config schema, version) is read from `docs/src/generated/*.json`, produced by `bun run generate` and guarded by a test. Content is MDX in `docs/content/docs` (folders = sections, `meta.json` = order). `cd docs && npm run dev`; CI (`docs.yml`) lints, validates links (`npm run check:links`) and builds. Every page is also served as Markdown (`.md`, or `Accept: text/markdown`) and listed in `/llms.txt`.
