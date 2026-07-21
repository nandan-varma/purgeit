# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@nandan-varma/purgeit` (bin: `purgeit`) — an npx-runnable CLI that finds and deletes regenerable dev build artifacts (`node_modules`, `dist`, `target`, `Pods`, ...) across a directory of projects. Interactive Ink TUI by default in a TTY; a full non-interactive flag surface otherwise. Safety is the entire point of the tool: matching is restricted to either unconditionally-safe directory names or names gated behind proof of a sibling manifest, and nothing is ever deleted without an explicit human action (TUI: multi-select + confirm, nothing selected by default; headless: `--delete` + confirmation unless `--yes`).

## Commands

```bash
npm run typecheck && npm run lint && npm test && npm run build   # full verify, run before considering work done
npm run coverage       # vitest run --coverage
npm run lint:fix       # biome check --write src/ (auto-fix, then re-run lint to confirm clean)
npm run build          # tsup → dist/
```

Run a single test file or a single test by name:
```bash
npx vitest run src/rules/merge.test.ts
npx vitest run -t "test name substring"
npx vitest             # watch mode
```

Coverage is enforced at **100%** statements/branches/functions/lines for everything except `src/ui/**` and `src/types.ts` (`vitest.config.ts`'s thresholds) — `npm run coverage` exits non-zero below that. `src/ui/**` is exempt because Ink rendering/keybinding branches don't map cleanly onto a hard coverage bar; it's exercised via `ink-testing-library` behavior tests instead (`App.test.tsx`).

Lint rules `noUnusedImports`, `noUnusedVariables`, and `useExhaustiveDependencies` are set to `"error"` in `biome.json` (not the recommended-preset default) — they've caught real bugs before (a dead test variable, a stale non-functional ESLint-style suppression comment that Biome doesn't recognize). Use `// biome-ignore lint/<rule>: <reason>` immediately above the offending line to suppress intentionally — it must be adjacent to the line the diagnostic actually anchors to (e.g. for `useExhaustiveDependencies` that's the `useEffect(() => {` line, not the closing `}, [deps])`).

## Architecture

### The isolation boundary

`src/ui/` is the **only** directory allowed to import `react` or `ink` — CI enforces this with a grep check (`.github/workflows/ci.yml`), and it's the reason the scanner/rule-engine/config/CLI core is plain, framework-agnostic TypeScript that's unit-testable with vitest alone and usable as a library independent of the TUI (`src/index.ts` is the public library entry: `scan`, rule types, `loadConfig`). Never import react/ink outside `src/ui/`.

### Data flow

```
rules/ (pure data + predicates, no fs except gate evaluation)
  default-rules.ts    ALWAYS_SAFE_NAMES / GATED_NAMES / PRUNE_META_NAMES — ported from a bash prototype
  gate-context.ts      createGateContext() — sync fs probes (siblingFile/siblingGlob/siblingGrep) scoped to a match's parent dir
  gate-conditions.ts   Gate predicates (Pods+Podfile, build+{manifest}, .gradle+{gradle file}, bin/obj+{.csproj/.sln})
  project-types.ts     detectProjectTypes() — display labels only (next/node/rust/xcode/...), no effect on matching
  validators.ts        warn-only manifest sanity checks (corrupted package.json, etc.)
  merge.ts              defaultRuleSet() + mergeRuleSets(base, userConfig) + restrictRuleSetToTargets()

config/                cosmiconfig-based resolution of purgeit.config.{js,ts,mjs,cjs,json} / .purgeitrc / package.json "purgeit" key
  schema.ts             PurgeitUserConfig shape, GateCondition compilation, assertPurgeitUserConfig() runtime validation
  resolve.ts             loadConfig() — searches upward from cwd unless --config/--no-config

scan/                  scan(root, ruleSet, opts): AsyncGenerator<ScanEvent>
  walk.ts                hand-rolled stack-based DFS (NOT fs { recursive: true } — needs selective pruning: never
                        descend into VCS/prune-meta dirs, stop recursing the instant an always-safe or gated name
                        matches, so a native module's own nested build/ inside node_modules can never be reached).
                        Symlinked dirs are never followed.
  size.ts                 computeSize() — du -s -k by default (feature-detected once), falls back to a p-limit(8)
                        pure-Node recursive stat-sum walk if du is unavailable.
  scanner.ts               scan() emits 'found' the instant a match is discovered (size: null) and an independent
                        'size' event once computeSize() resolves — discovery is never blocked on sizing. An
                        internal AsyncQueue bridges concurrent p-limit-scheduled size computations into one ordered
                        stream. 'projects' mode (default) treats root's immediate children as projects; 'flat'
                        mode (--full) treats root as one scan unit.

delete/deleter.ts       deleteEntries(paths, opts): AsyncGenerator<DeleteEvent> — dry-run support, per-path
                        failure aggregation (one bad path doesn't abort the batch), and isDangerousPath() as a
                        last-line-of-defense refusal to delete the filesystem root or the user's home directory,
                        independent of whatever the rule engine matched.

cli/                    args.ts (parseCliArgs) → cli.ts (runCli: TTY-dispatch) → headless.ts | ui/run-tui.ts
  cli.ts                 TUI only when stdout is a TTY AND none of --json/--delete/--headless was passed;
                        --tui/--headless force one mode regardless of TTY. Never calls process.exit — returns
                        the exit code, with injectable stdout/stderr/cwd/signal for testing (mirrors platex's
                        runCli(argv, io) pattern).
  cli-main.ts             Thin executable: wires SIGINT → AbortController, sets process.exitCode.
  headless.ts              Non-interactive path: resolves config, scans, applies exclude/min-size/targets/
                        no-gated filters, then --json or a text preview, or --delete (confirms unless --yes).

ui/                     App.tsx (useReducer + useInput keymap + phase machine) / state.ts (pure, no JSX) /
                        useScanner.ts (bridges scan()'s async generator into the reducer via useEffect + for
                        await, AbortController created on mount and aborted on unmount) / components/*.tsx
```

### TUI safety model (don't regress)

Nothing is selected by default; `space` toggles selection; a separate `confirming` phase (reachable only via `enter` with ≥1 selected) is the only path that can trigger deletion — this is the explicit safety differentiator from npkill-style tools. `q`/Ctrl+C must actually call Ink's `useApp().exit()` to quit (not just update reducer state) — a prior bug had `q` update `phase` without ever calling `unmount()`, leaving the real CLI process hanging forever after showing the summary. `state.ts`'s `sortedEntries()` is the single source of truth for display order; the reducer's cursor/`TOGGLE_SELECT` resolve against it (not raw discovery order) so the row a user sees highlighted is always the one space/enter act on — don't reintroduce a separate unsorted render path.

### TypeScript gotchas

- **`exactOptionalPropertyTypes: true`** — optional fields fed by `T | undefined` values must be declared `field?: T | undefined`, not just `field?: T`. Every options interface in the codebase follows this; match it.
- **`noUncheckedIndexedAccess: true`** — array/index access produces `T | undefined`. Use `as T` when a value is genuinely guaranteed (e.g. regex captures after a successful match), don't add defensive `??` that creates an unreachable branch (100% branch coverage will catch it).
- **No `rootDir`** — removed because `test/fixtures/build-tmp-tree.ts` lives outside `src/` and is imported by many `*.test.ts` files. Don't re-add it.
- **`jsx: "react-jsx"`** — needed for Ink components in `src/ui/`.

### Build (tsup)

Two entries in `tsup.config.ts`, in order: library (`src/index.ts` → `dist/index.{js,cjs,d.ts}`, ESM+CJS, `dts: true`, `clean: true`, `external: ['react','ink']`) and CLI (`src/cli/cli-main.ts` → `dist/cli.js`, ESM-only, `clean: false`, `esbuildOptions.jsx = 'automatic'` for the `.tsx` UI files pulled in transitively). **Never put `#!/usr/bin/env node` literally in a source file** — tsup's `banner.js` option adds it; doing both produces a duplicate shebang that breaks execution (this has happened once already).

### Testing conventions

- **Real filesystem fixtures, not mocks** — `test/fixtures/build-tmp-tree.ts`'s `buildTree()`/`cleanupTree()` create/remove real temp dirs via `mkdtempSync`. Don't mock `fs` for scanner/walk/rule tests.
- **`fileParallelism: false`** (`vitest.config.ts`) — tests spawn real `du` child processes; parallel file execution exhausts `posix_spawn` on macOS.
- **Mocking ESM modules** — `vi.spyOn` cannot redefine a live ESM namespace export (`Cannot redefine property`). Use `vi.mock('module', async (importOriginal) => { const actual = await importOriginal(); return { ...actual, fn: vi.fn(actual.fn) }; })` at module load time instead, then grab the mock via `vi.mocked(...)` after the dynamic `await import(...)` of the module under test. See `src/cli/cli.test.ts` and `src/cli/headless-scan-error.test.ts`.
- **`scan()` swallows its own fs errors internally** — `headless.ts`'s catch block around its `for await` loop is otherwise unreachable. Test it by mocking `../scan/scanner.js`'s `scan` to throw (dedicated file: `headless-scan-error.test.ts`).
- **Abort timing** — don't rely on inter-project/inter-directory navigation timing for "aborts mid-scan" tests; it's genuinely racy. Use multiple matching dirs as *siblings in one directory* with `concurrency: 1` so p-limit's queuing is deterministic (only the first task runs immediately, the rest are provably still queued) — see `scanner.test.ts`.
- **`Array.prototype.sort` doesn't invoke its comparator for arrays of length ≤ 1**, and for length 2 calls it exactly once with the operands in original array order — when testing a sort comparator's null-coalescing branches, you need entries in both orderings (two test cases with swapped discovery order) to hit both operand positions. See `headless-null-size.test.ts` / `headless-null-size-reverse.test.ts`.
- **TUI tests needing real Ink internals** (e.g. asserting `waitUntilExit()` actually resolves, not just that reducer state changed) can't use `ink-testing-library`'s `render()` since it doesn't expose `waitUntilExit`. Construct a minimal fake stdin/stdout (EventEmitter + `isTTY`/`setRawMode`/`read()`/`ref`/`unref`) and call `ink`'s real `render()` directly — see `App.test.tsx`'s quitting test.
- Manually driving the built TUI to reproduce a real bug requires a pty (`python3`'s `pty.fork()`, or `script`) — piped stdin can't enable raw mode, so `child_process.spawn` with plain pipes fails with "Raw mode is not supported."

Full architecture/decision history lives in `AGENTS.md` (durable conventions) — read it too before making structural changes.
