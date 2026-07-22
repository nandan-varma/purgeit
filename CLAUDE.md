# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`purgeit` (bin: `purgeit`) — an npx-runnable CLI that finds and deletes regenerable dev build artifacts (`node_modules`, `dist`, `target`, `Pods`, ...) across a directory of projects. Interactive Ink TUI by default in a TTY; a full non-interactive flag surface otherwise. Safety is the entire point of the tool: matching is restricted to either unconditionally-safe directory names or names gated behind proof of a sibling manifest, and nothing is ever deleted without an explicit human action (TUI: multi-select + confirm, nothing selected by default; headless: `--delete` + confirmation unless `--yes`).

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
  async-queue.ts          AsyncQueue<T> — minimal pull-based queue bridging multiple concurrent p-limit-scheduled
                        producers (directory reads in walk.ts, size computations in scanner.ts) into one ordered
                        async generator for a consumer to `for await` over. Shared by both.
  walk.ts                 Concurrently schedules directory reads (NOT fs { recursive: true } and NOT a strictly
                        sequential DFS — needs selective pruning AND bounded parallelism: never descend into
                        VCS/prune-meta dirs, stop recursing the instant an always-safe or gated name matches (so a
                        native module's own nested build/ inside node_modules can never be reached), and read
                        sibling directories concurrently up to a shared p-limit (default 8, same limiter scanner.ts
                        uses for sizing, so total in-flight fs work stays bounded — this is what makes wide
                        multi-project trees fast without hammering the filesystem). Symlinked dirs are never
                        followed. Because sibling directory reads are concurrent, an abort only takes effect before
                        the *next* directory read is scheduled — matches from an already-in-flight directory's
                        synchronous entry loop still land (see walk.test.ts).
  size.ts                 computeSize() — du -s -k by default (feature-detected once), falls back to a p-limit(8)
                        pure-Node recursive stat-sum walk if du is unavailable.
  exclude.ts               createExcludeMatcher(root, patterns) — glob-to-regex --exclude predicate, relative-to-root
                        and POSIX-normalized so it works the same on Windows; shared verbatim by headless.ts and
                        useScanner.ts so both honor --exclude identically.
  scanner.ts               scan() emits 'found' the instant a match is discovered (size: null) and an independent
                        'size' event once computeSize() resolves — discovery is never blocked on sizing. 'projects'
                        mode (default) treats root's immediate children as projects; 'flat' mode (--full) treats
                        root as one scan unit. listProjects() (projects mode only) checks each top-level child's
                        *name* against the ruleset before treating it as a project: a name that's itself an
                        always-safe/gated match (e.g. running purgeit directly inside a single project, where
                        node_modules/dist/build shows up as an immediate child of the scanned root) is reported
                        directly as a match instead — walk() only ever checks a directory's children against the
                        ruleset, never the root path it's handed, so without this a project-shaped node_modules
                        would be walked in full, resurfacing nested artifacts (e.g. under .pnpm) as spurious
                        top-level "duplicates" while wastefully traversing the whole subtree.

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

ui/                     Note: `src/ui/format.ts` (fmtSize, for TUI display) is a distinct file from the
                        top-level `src/format.ts` (formatBytes/parseSizeString, for headless output and
                        --min-size parsing) — same domain, deliberately separate so `src/ui/` stays the only
                        importer of anything TUI-flavored; don't merge them or import one from the other's side.
                        App.tsx (useReducer + useInput keymap + phase machine) / state.ts (pure, no JSX) /
                        useScanner.ts (bridges scan()'s async generator into the reducer via useEffect + for
                        await, AbortController created on mount and aborted on unmount) / theme.ts (colors +
                        glyphs + fixed COLUMN_WIDTHS) / layout.ts (pure, framework-free sizing math:
                        computeVisibleRows(), NARROW_TERMINAL_COLUMNS, MIN_PATH_WIDTH — shared by ArtifactList's
                        viewport and App.tsx's PageUp/PageDown size so both agree on "a page") /
                        useTerminalSize.ts (resize-reactive stdout.columns/rows) / useSpinner.ts (interval-driven
                        braille spinner, used by Header/DeletingProgress while active) /
                        components/*.tsx (ArtifactList/TableHeader/Row render the artifact table; HelpOverlay is
                        the `?`-key modal)
```

### TUI safety model (don't regress)

Nothing is selected by default; `space` toggles selection; a separate `confirming` phase (reachable only via `enter` with ≥1 selected) is the only path that can trigger deletion — this is the explicit safety differentiator from npkill-style tools. `q`/Ctrl+C must actually call Ink's `useApp().exit()` to quit (not just update reducer state) — a prior bug had `q` update `phase` without ever calling `unmount()`, leaving the real CLI process hanging forever after showing the summary. `state.ts`'s `sortedEntries()` is the single source of truth for display order; the reducer's cursor/`TOGGLE_SELECT` resolve against it (not raw discovery order) so the row a user sees highlighted is always the one space/enter act on — don't reintroduce a separate unsorted render path.

### TUI table layout

`ArtifactList`/`TableHeader`/`Row` render a real table via Ink `Box` flex columns, not concatenated `Text` strings. Selection/cursor are a **full-row background color band** (green/cyan), not just a checkbox glyph: set `backgroundColor` once on a row's outer `<Box>` and every nested `<Text>` inherits it automatically via Ink's `backgroundContext` (see `node_modules/ink/build/components/Text.js` — `inheritedBackgroundColor = useContext(backgroundContext)`), including the flex-grow path column's trailing empty space, so no manual string-padding is needed. `theme.ts`'s `COLUMN_WIDTHS`/`COLUMN_GAP` are shared by both `Row.tsx` and `TableHeader.tsx` — they must stay structurally identical (same number of column `Box`es, same `columnGap`, same `flexShrink={0}` on every fixed column) or header labels drift out of alignment with row cells / columns wrap mid-cell during a resize race (see below). The PATH column is `flexGrow={1}` + `wrap="truncate-start"` (keeps the meaningful tail of the path, e.g. the artifact's own dir), not a JS-computed `width` — that makes it correct immediately on terminal resize via Yoga alone, no React re-render required. The PROJECT column hides below `NARROW_TERMINAL_COLUMNS` (`layout.ts`) to give PATH more room; `ArtifactList` passes `showProject` to both `Row` and `TableHeader` so they stay in sync.

### The TUI must never render more lines than the terminal has rows

This is the single most important constraint in `src/ui/` and the source of the two nastiest bugs so far — read this before touching layout. Ink's terminal redraw works by moving the cursor up exactly as many rows as the *previous* frame occupied, erasing, and rewriting. If the app's actual rendered output ever exceeds `stdout.rows`, the terminal itself scrolls to accommodate it, which silently invalidates that "cursor up N rows" assumption — Ink has a reactive recovery path for this, but it only triggers based on the *previous* frame's height, so the render that first overflows isn't covered. The result is cascading, worsening visual corruption (stacked/overlapping border boxes) across repeated resizes, and it's invisible to a plain ANSI-stripped text dump — you need an actual terminal emulator to see it (see Testing conventions below).

Two-part fix, both required:
1. **`App.tsx`'s root `<Box>` is hard-clamped**: `height={rows} overflow="hidden"` (from `useTerminalSize()`). This makes overflow structurally impossible regardless of how inaccurate any component's own size estimate is (`layout.ts`'s `computeVisibleRows()` is only ever a *budget estimate* — it can't cheaply account for every combination, e.g. `ConfirmDialog`'s variable-length item preview stacked on an already-full list).
2. **Every bordered chrome `Box` (`Header`, `ConfirmDialog`, `DeletingProgress`, `DoneSummary`) has `flexShrink={0}`**. Yoga's default (`flexShrink: 1`) means a height-constrained parent tries to *shrink* children to fit before clipping anything — and a bordered box that gets shrunk instead of clipped doesn't degrade gracefully, its top/bottom border rows collapse together with content into one garbled line. `flexShrink={0}` forces each of these to render fully or be omitted entirely by the outer clip. `Legend` is deliberately left shrinkable (default) since it's the lowest-priority content and should be first to give way on a too-short terminal, not the header or a destructive-action confirm dialog.

Also: every dynamic-content `Text` in the header/dialogs has an explicit `wrap="truncate-*"`. An un-truncated `Text` can silently word-wrap onto a second line at a narrow width — that's *also* an unpredictable line-count change with the same redraw-desync risk, just triggered by width instead of height. `Header`'s "N selected" row is always rendered (space placeholder when nothing's selected) rather than conditionally omitted, for the same reason: any line-count change your own component causes for reasons Ink can't see coming is a redraw hazard.

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
- **Asserting on ANSI color codes in `ink-testing-library` output** — Ink colorizes through a shared `chalk` singleton, and chalk auto-detects color support from the *real* `process.stdout`, not the fake streams `ink-testing-library` renders into. Under vitest (non-TTY) that means color output is silently disabled and any ANSI-code assertion vacuously passes. Set `chalk.level = 1` at the top of the test file before rendering to force it on (see `App.test.tsx`'s row-highlight-color test).
- Manually driving the built TUI to reproduce a real bug requires a pty (`python3`'s `pty.fork()`, or `script`) — piped stdin can't enable raw mode, so `child_process.spawn` with plain pipes fails with "Raw mode is not supported." `pty.fork()` also doesn't set a window size by default, so `process.stdout.columns`/`.rows` read `0` inside it — an unset winsize produces a garbled character-per-line render that looks like a real bug but isn't one. Set it explicitly *before* the child writes anything: `fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))`, then `os.kill(pid, signal.SIGWINCH)` for any size change after startup.
- **CI runs one extra check beyond the local verify command**: `.github/workflows/ci.yml`, after build, greps `src/` for `from 'react'`/`from 'ink'` outside `src/ui/` (the isolation boundary, enforced in CI not just convention) and then runs a headless smoke test — `npx tsx test/fixtures/ci-smoke-fixture.ts` builds a real fixture tree (a node_modules/dist pair plus a Pods+Podfile gated pair) and pipes its path into `node dist/cli.js <path> --json --dry-run`, asserting `entries.length >= 2`. This is the only place the built `dist/cli.js` is actually exercised end-to-end; it'll miss anything that passes unit tests but breaks in the tsup-built output.
- **Diagnosing redraw/resize corruption needs a real terminal emulator, not a text dump.** Stripping ANSI codes from raw output and reading it as text only shows you *what Ink sent*, not what the terminal screen actually looks like after cursor-based overwrites — which is exactly where redraw-desync bugs (see "must never render more lines than the terminal has rows" above) live. Feed the pty's raw bytes through `pyte` (`pip install pyte`; `pyte.Screen(cols, rows)` + `pyte.ByteStream(screen).feed(data)`) and read `screen.display` — a real emulated grid — to see genuine leftover artifacts, mangled borders, etc. Call `screen.resize(rows, cols)` in lockstep with `TIOCSWINSZ` so the emulator's buffer matches what the real terminal would do.

### Releasing

Tag-push triggered: bump `version` in `package.json`/`package-lock.json` (`npm version patch --no-git-tag-version`), commit, push to `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z` — `.github/workflows/release.yml` runs `npm publish --provenance --access public` on any `v*` tag push. `NPM_TOKEN` is already configured on the repo and this flow has published successfully multiple times; the pre-flight `NPM_TOKEN` checklist in `CONTRIBUTING.md` is for a from-scratch repo, not a live concern here.

Full architecture/decision history lives in `AGENTS.md` (durable conventions) — read it too before making structural changes.
