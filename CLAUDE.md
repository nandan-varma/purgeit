# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`purgeit` (bin: `purgeit`) — an npx-runnable CLI that finds and deletes regenerable dev build artifacts (`node_modules`, `dist`, `target`, `Pods`, ...) across a directory of projects, and (opt-in, headless-only) forgotten cloud dev environments — tagged AWS CloudFormation stacks, labeled GCP Compute Engine/GKE resources. Interactive Ink TUI by default in a TTY for local scans; a full non-interactive flag surface otherwise, and always for `--provider aws|gcp`. Safety is the entire point of the tool: local matching is restricted to either unconditionally-safe directory names or names gated behind proof of a sibling manifest; cloud discovery is restricted to resources carrying every one of a required set of tag/label key-value pairs (an empty tag set is refused outright, never treated as "match everything"). Nothing is ever deleted without an explicit human action (TUI: multi-select + confirm, nothing selected by default; headless: `--delete` + confirmation unless `--yes`).

Requires **Node ≥22** (`package.json` `engines`, CI's node-version matrix) — raised from ≥20 when `ink` was bumped 6→7, which hard-requires Node 22. `docs/` (the Starlight/Astro site at `purgeit.nandan.fyi`) is a separate npm project with its own `package.json`/lockfile/deps; it's not part of the root `npm run build`/`npm test` pipeline.

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

`src/ui/` is the **only** directory allowed to import `react` or `ink` — CI enforces this with a grep check (`.github/workflows/ci.yml`), and it's the reason the scanner/rule-engine/config/CLI/providers core is plain, framework-agnostic TypeScript that's unit-testable with vitest alone and usable as a library independent of the TUI (`src/index.ts` is the public library entry: `scan`, rule types, `loadConfig`, the `providers/` cloud types). Never import react/ink outside `src/ui/`.

### Data flow

```
rules/ (pure data + predicates, no fs except gate evaluation)
  catalog/              RULE_CATALOG — the single source of truth for every built-in rule (name,
                        kind, ecosystem categories, human-readable description, and — for gated
                        rules — a declarative `when` GateCondition, the same shape user configs
                        use). One file per ecosystem (javascript.ts, python.ts, rust.ts, apple.ts,
                        dotnet.ts, java-jvm.ts, ruby.ts, dart-flutter.ts, elixir.ts, haskell.ts,
                        elm.ts, zig.ts, vcs.ts) plus shared.ts for names that are genuinely
                        polyglot (`build`, `vendor` — gated on whichever ecosystem's manifest is
                        actually present, tagged with all the categories they cover). types.ts
                        holds RuleCategory/CATEGORY_LABELS/CATEGORY_ORDER. index.ts aggregates
                        everything into RULE_CATALOG and is re-exported from the package's public
                        API (src/index.ts) so docs — or any other consumer — render rule tables
                        directly from it instead of hand-copying, which is what caused a real
                        inaccuracy before (`.build` was documented as a Python artifact; it's
                        actually Swift Package Manager's). To add an ecosystem: new
                        `catalog/<name>.ts` exporting `readonly RuleDefinition[]`, add it to the
                        spread in `catalog/index.ts`, add its RuleCategory to `types.ts`. Note:
                        `docs/src/components/RuleAccordion.astro` imports straight from this TS
                        source (`../../../src/rules/catalog/index.js`, `.../types.js`,
                        `../../../src/config/schema.js`), not the built `dist/` or the published
                        package — Astro's Vite pipeline compiles it at docs-build time. Renaming or
                        moving these files breaks the docs build silently; the root repo's
                        typecheck/lint/test/build won't catch it.
  default-rules.ts    ALWAYS_SAFE_NAMES / GATED_NAMES / PRUNE_META_NAMES — derived from
                        RULE_CATALOG by filtering on `kind`, not hand-maintained
  gate-context.ts      createGateContext() — sync fs probes (siblingFile/siblingGlob/siblingGrep) scoped to a match's parent dir
  gate-conditions.ts   DEFAULT_GATES — compiles each gated RULE_CATALOG entry's declarative
                        `when` via the same compileGateConditions() user configs go through
                        (config/schema.ts), rather than hand-written Gate closures
  project-types.ts     detectProjectTypes() — display labels only (next/node/rust/xcode/...), no effect on matching
  validators.ts        warn-only manifest sanity checks (corrupted package.json, etc.)
  merge.ts              defaultRuleSet() + mergeRuleSets(base, userConfig) + restrictRuleSetToTargets()

config/                cosmiconfig-based resolution of purgeit.config.{js,ts,mjs,cjs,json} / .purgeitrc / package.json "purgeit" key
  schema.ts             PurgeitUserConfig shape (incl. optional `cloud` section: aws
                        profile/region, gcp project, default tagKey/tagValue, maxAgeDays),
                        GateCondition compilation, assertPurgeitUserConfig() runtime validation
  resolve.ts             loadConfig() — searches upward from cwd unless --config/--no-config

scan/                  scan(root, ruleSet, opts): AsyncGenerator<ScanEvent> — the LOCAL filesystem domain
  async-queue.ts          AsyncQueue<T> — minimal pull-based queue bridging multiple concurrent p-limit-scheduled
                        producers (directory reads in walk.ts, size + lastModified computations in scanner.ts)
                        into one ordered async generator for a consumer to `for await` over. Shared by both.
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
  scanner.ts               scan() emits 'found' the instant a match is discovered (size/lastModified: null) and
                        independent 'size'/'lastModified' events once computeSize()/stat() resolve — discovery is
                        never blocked on either. Both async resolutions are tracked against the same `pendingTasks`
                        counter so 'done' can't fire while either is still in flight (a stat() that resolved after
                        an untracked 'done' would be silently dropped — AsyncQueue.push is a no-op once closed).
                        'projects' mode (default) treats root's immediate children as projects; 'flat' mode
                        (--full) treats root as one scan unit. listProjects() (projects mode only) checks each
                        top-level child's *name* against the ruleset before treating it as a project: a name
                        that's itself an always-safe/gated match (e.g. running purgeit directly inside a single
                        project, where node_modules/dist/build shows up as an immediate child of the scanned root)
                        is reported directly as a match instead — walk() only ever checks a directory's children
                        against the ruleset, never the root path it's handed, so without this a project-shaped
                        node_modules would be walked in full, resurfacing nested artifacts (e.g. under .pnpm) as
                        spurious top-level "duplicates" while wastefully traversing the whole subtree.

delete/deleter.ts       deleteEntries(paths, opts): AsyncGenerator<DeleteEvent> — dry-run support, per-path
                        failure aggregation (one bad path doesn't abort the batch), and isDangerousPath() as a
                        last-line-of-defense refusal to delete the filesystem root or the user's home directory,
                        independent of whatever the rule engine matched.

providers/              The CLOUD resource domain — deliberately parallel to, not unified with, scan/+delete/.
                        Bytes-vs-dollars and path-vs-ARN are different enough concepts that forcing them into one
                        shared type would hide real differences; unification (where it happens at all) is at
                        display/report time in the CLI layer, not in these domain types.
  types.ts                CloudResource/CostEstimate/CloudDiscoveryOptions/CloudScanEvent/CloudDeleteEvent/
                        CloudProvider — the shared interface every concrete provider implements.
                        CloudDiscoveryOptions.tags is a `ReadonlyMap<string,string>` (AND semantics, not a single
                        key/value pair) — both providers' discover() throw if it's empty rather than treating "no
                        filter" as "match everything" (a deliberate safety guard for a deletion tool, not just
                        relying on the CLI layer to always supply a default).
  registry.ts             loadProvider(id) — dynamically imports aws/provider.js or gcp/provider.js so the SDKs
                        are never loaded/required for a plain local scan (verified: neither SDK appears in the
                        built dist/cli.js — only the dynamic import() string literals and error-hint text do).
  aws/                    CloudFormation stack discovery (paginated DescribeStacks, one region per call —
                        CloudFormation has no "list stacks in every region" API), billed cost via one batched Cost
                        Explorer call grouped by the `aws:cloudformation:stack-name` cost allocation tag (real
                        spend, not an estimate), DeleteStack-based deletion. `--aws-profile` is applied via the
                        `AWS_PROFILE` env var so the SDK's own default credential chain resolves it — purgeit never
                        handles credentials itself.
  gcp/                    Compute Engine instance discovery (`aggregatedList` — every zone in one call) + GKE
                        cluster discovery (`listClusters` with `locations/-` — every location in one call); GCP has
                        no CloudFormation-shaped "stack" concept in common use, so discovery targets the actual
                        costly resources directly. **No cost estimation** — GCP has no Cost-Explorer-shaped API;
                        a real estimate would need paginating ~10k+ Billing Catalog SKUs and pattern-matching
                        fragile description strings, which can't be verified without a live billing account.
                        `cost` is always `null`; `--with-cost` is rejected outright for `--provider gcp` rather
                        than silently no-op'ing.
                        Both providers' SDKs (`@aws-sdk/client-cloudformation`, `@aws-sdk/client-cost-explorer`,
                        `@google-cloud/compute`, `@google-cloud/container`) are **optional peerDependencies**
                        (`peerDependenciesMeta.*.optional: true`) — the exact same pattern already used for
                        `cosmiconfig-typescript-loader` in config/resolve.ts's `tsLoader`. Missing-package failures
                        surface as a friendly `npm install ...` hint (`sdk-loader.ts` in each provider dir), not a
                        raw module-resolution error.

cli/                    args.ts (parseCliArgs) → cli.ts (runCli: subcommand/TTY-dispatch) → headless.ts |
                        headless-cloud.ts | ui/run-tui.ts | skills.ts
  cli.ts                 `argv[0] === 'skills'` is checked and dispatched to skills.ts *before* parseCliArgs
                        ever runs — 'skills' is a subcommand, not a directory positional, so it must be
                        intercepted ahead of the flag-based parsing surface entirely. Otherwise: TUI only when
                        `--provider` is `local` (the default) AND stdout is a TTY AND none of
                        --json/--delete/--headless was passed; --tui/--headless force one mode regardless of TTY
                        for local scans. `--provider aws|gcp` always dispatches to headless-cloud.ts, even in a
                        TTY, even with `--tui` (which errors instead of silently no-op'ing) — the interactive
                        TUI's data model (AppState, Row.tsx, TableHeader.tsx) is local-filesystem-specific, and its
                        redraw/layout invariants are fragile enough (see below) that a real dual local|cloud TUI is
                        a deliberately deferred, separate piece of work rather than a hasty extension. Never calls
                        process.exit — returns the exit code, with injectable stdout/stderr/cwd/signal for testing
                        (mirrors platex's runCli(argv, io) pattern).
  cli-main.ts             Thin executable: wires SIGINT → AbortController, sets process.exitCode.
  headless.ts              Non-interactive LOCAL path: resolves config, scans, applies exclude/min-size/min-age/
                        max-age/targets/no-gated filters, then --json or a text preview, or --delete (confirms
                        unless --yes) via report.ts's shared tail.
  headless-cloud.ts        Non-interactive CLOUD path (the --provider aws|gcp counterpart): resolves tag filter/
                        region/profile/project from CLI flags with purgeit.config's `cloud` section as fallback
                        (CLI flag always wins), discovers via the requested CloudProvider, applies --min-age/
                        --max-age against each resource's createdAt, then --json or a text preview (cost/type/
                        age), or --delete via the same report.ts tail — with a stronger confirm-prompt wording,
                        since a deleted stack/cluster is frequently NOT regenerable the way node_modules is.
  report.ts                Shared confirm-unless-yes → stream a delete-event generator → tally-and-print control
                        flow, used by both headless.ts and headless-cloud.ts (this duplication existed once in
                        headless.ts alone before the cloud path existed; a second real caller is what justified
                        extracting it, not a hypothetical one). Local `DeleteEvent` (keyed by `path`) and cloud
                        `CloudDeleteEvent` (keyed by `id`) are each mapped to a common `{type, key, ...}` shape by
                        their caller before being handed to `confirmAndDelete()` — the shared helper itself stays
                        domain-agnostic rather than forcing the two event types together.

ui/                     LOCAL-ONLY this release (see cli.ts above). Note: `src/ui/format.ts` (fmtSize/fmtAge, for
                        TUI display) is a distinct file from the top-level `src/format.ts` (formatBytes/
                        parseSizeString/parseDuration/formatDuration, for headless output and --min-size/
                        --min-age parsing) — same domains, deliberately duplicated so `src/ui/` stays the only
                        importer of anything TUI-flavored; don't merge them or import one from the other's side.
                        App.tsx (useReducer + useInput keymap + phase machine) / state.ts (pure, no JSX) /
                        useScanner.ts (bridges scan()'s async generator into the reducer via useEffect + for
                        await, AbortController created on mount and aborted on unmount; also does the size/
                        lastModified-deferred-filtering dance for --min-size/--min-age/--max-age so a
                        filtered-out match never flashes into the visible list) / theme.ts (colors + glyphs +
                        fixed COLUMN_WIDTHS + ageColor() warmth mapping) / layout.ts (pure, framework-free sizing
                        math: computeVisibleRows(), NARROW_TERMINAL_COLUMNS, MIN_PATH_WIDTH — shared by
                        ArtifactList's viewport and App.tsx's PageUp/PageDown size so both agree on "a page") /
                        useTerminalSize.ts (resize-reactive stdout.columns/rows) / useSpinner.ts (interval-driven
                        braille spinner, used by Header/DeletingProgress while active) /
                        components/*.tsx (ArtifactList/TableHeader/Row render the artifact table, incl. an AGE
                        column color-coded by ageColor(); HelpOverlay is the `?`-key modal)

skills/purgeit/         Agentic-skill content for LLM callers, following agent-browser's SKILL.md convention —
                        shipped in the published npm package (package.json's "files"). SKILL.md is a
                        *discovery stub* only (short, stable frontmatter + a pointer); the actual guidance is
                        served by `purgeit skills list|get <name> [--full]` (cli/skills.ts, dispatched in
                        cli.ts before parseCliArgs runs, since 'skills' is a subcommand, not a directory
                        positional or a flag) reading core.md/cloud.md/reference.md directly from the
                        installed package — so instructions always match the installed version instead of
                        going stale inside a baked-in tool description. `reference.md` is an addendum (--full),
                        not a standalone skill. cli/skills.ts resolves the skills/ dir with the same
                        dual-candidate trick (`../skills/purgeit/` vs `../../skills/purgeit/`) cli.ts's
                        readOwnVersion() uses for package.json, since it runs both as built dist/cli.js and
                        directly from src/cli/*.ts in dev.
```

### TUI safety model (don't regress)

Nothing is selected by default; `space` toggles selection; a separate `confirming` phase (reachable only via `enter` with ≥1 selected) is the only path that can trigger deletion — this is the explicit safety differentiator from npkill-style tools. `q`/Ctrl+C must actually call Ink's `useApp().exit()` to quit (not just update reducer state) — a prior bug had `q` update `phase` without ever calling `unmount()`, leaving the real CLI process hanging forever after showing the summary. `state.ts`'s `sortedEntries()` is the single source of truth for display order; the reducer's cursor/`TOGGLE_SELECT` resolve against it (not raw discovery order) so the row a user sees highlighted is always the one space/enter act on — don't reintroduce a separate unsorted render path.

### TUI table layout

`ArtifactList`/`TableHeader`/`Row` render a real table via Ink `Box` flex columns, not concatenated `Text` strings. Selection/cursor are a **full-row background color band** (green/cyan), not just a checkbox glyph: set `backgroundColor` once on a row's outer `<Box>` and every nested `<Text>` inherits it automatically via Ink's `backgroundContext` (see `node_modules/ink/build/components/Text.js` — `inheritedBackgroundColor = useContext(backgroundContext)`), including the flex-grow path column's trailing empty space, so no manual string-padding is needed. `theme.ts`'s `COLUMN_WIDTHS`/`COLUMN_GAP` are shared by both `Row.tsx` and `TableHeader.tsx` — they must stay structurally identical (same number of column `Box`es, same `columnGap`, same `flexShrink={0}` on every fixed column) or header labels drift out of alignment with row cells / columns wrap mid-cell during a resize race (see below). The PATH column is `flexGrow={1}` + `wrap="truncate-start"` (keeps the meaningful tail of the path, e.g. the artifact's own dir), not a JS-computed `width` — that makes it correct immediately on terminal resize via Yoga alone, no React re-render required. The PROJECT and AGE columns hide below `NARROW_TERMINAL_COLUMNS` (`layout.ts`) to give PATH more room; `ArtifactList` passes a single `showWideColumns` flag to both `Row` and `TableHeader` so all wide-only columns stay in sync.

### The TUI must never render more lines than the terminal has rows

This is the single most important constraint in `src/ui/` and the source of the two nastiest bugs so far — read this before touching layout. Ink's terminal redraw works by moving the cursor up exactly as many rows as the *previous* frame occupied, erasing, and rewriting. If the app's actual rendered output ever exceeds `stdout.rows`, the terminal itself scrolls to accommodate it, which silently invalidates that "cursor up N rows" assumption — Ink has a reactive recovery path for this, but it only triggers based on the *previous* frame's height, so the render that first overflows isn't covered. The result is cascading, worsening visual corruption (stacked/overlapping border boxes) across repeated resizes, and it's invisible to a plain ANSI-stripped text dump — you need an actual terminal emulator to see it (see Testing conventions below).

Two-part fix, both required:
1. **`App.tsx`'s root `<Box>` is hard-clamped**: `height={rows} overflow="hidden"` (from `useTerminalSize()`). This makes overflow structurally impossible regardless of how inaccurate any component's own size estimate is (`layout.ts`'s `computeVisibleRows()` is only ever a *budget estimate* — it can't cheaply account for every combination, e.g. `ConfirmDialog`'s variable-length item preview stacked on an already-full list).
2. **Every bordered chrome `Box` (`Header`, `ConfirmDialog`, `DeletingProgress`, `DoneSummary`) has `flexShrink={0}`**. Yoga's default (`flexShrink: 1`) means a height-constrained parent tries to *shrink* children to fit before clipping anything — and a bordered box that gets shrunk instead of clipped doesn't degrade gracefully, its top/bottom border rows collapse together with content into one garbled line. `flexShrink={0}` forces each of these to render fully or be omitted entirely by the outer clip. `Legend` is deliberately left shrinkable (default) since it's the lowest-priority content and should be first to give way on a too-short terminal, not the header or a destructive-action confirm dialog.

Also: every dynamic-content `Text` in the header/dialogs has an explicit `wrap="truncate-*"`. An un-truncated `Text` can silently word-wrap onto a second line at a narrow width — that's *also* an unpredictable line-count change with the same redraw-desync risk, just triggered by width instead of height. `Header`'s "N selected" row is always rendered (space placeholder when nothing's selected) rather than conditionally omitted, for the same reason: any line-count change your own component causes for reasons Ink can't see coming is a redraw hazard.

### TypeScript gotchas

- **`exactOptionalPropertyTypes: true`** — optional fields fed by `T | undefined` values must be declared `field?: T | undefined`, not just `field?: T`. Every options interface in the codebase follows this; match it.
- **`noUncheckedIndexedAccess: true`** — array/index access produces `T | undefined`. Use `as T` when a value is genuinely guaranteed (e.g. regex captures after a successful match, or a match/tag lookup a preceding guard already confirmed exists), don't add defensive `??`/fallback that creates an unreachable branch (100% branch coverage will catch it — see e.g. `providers/aws/discover.ts`'s `toTagRecord`, `providers/gcp/discover.ts`'s label-record cast).
- **No `rootDir`** — removed because `test/fixtures/build-tmp-tree.ts` lives outside `src/` and is imported by many `*.test.ts` files. Don't re-add it.
- **`jsx: "react-jsx"`** — needed for Ink components in `src/ui/`.
- **`typescript` is deliberately pinned below latest** (`^6.0.3`, not `^7.x`) — TypeScript 7's compiler API isn't stable until 7.1, and it breaks tsup's dts bundler (`rollup-plugin-dts`, built on the TS Language Service): `npm run build`'s DTS step throws `Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')` under TS7. Don't bump past 6.x until tsup/rollup-plugin-dts confirm TS7 support.
- **`"types": ["node"]`** and **`"ignoreDeprecations": "6.0"`** — both required for tsup's *isolated* dts-build program (not the main `tsc --noEmit` invocation, which works fine without them) once on TypeScript 6+: without `types`, TS6's new hard default (`types` defaults to `[]` instead of auto-including everything in `node_modules/@types`) makes the dts pass fail with `Cannot find name 'process'`; without `ignoreDeprecations`, it fails with `TS5101` (bare `baseUrl`, which tsup's dts tooling sets internally, is deprecated as of TS6).
- **Cloud SDK types (`@aws-sdk/*`, `@google-cloud/*`) are real devDependencies** even though they're *optional* peerDependencies at runtime — this gives full static typing against the real SDK shapes while `providers/*/sdk-loader.ts` still only ever `import()`s them dynamically at runtime. GCP's protobuf-generated types use `field: T | undefined` (required key, possibly-undefined value) rather than `field?: T` for many properties (e.g. `Stack.StackName`, `Cluster.location`) — test fixtures must include the key explicitly (`StackName: undefined`), not omit it, to satisfy the type.

### Build (tsup)

Two entries in `tsup.config.ts`, in order: library (`src/index.ts` → `dist/index.{js,cjs,d.ts}`, ESM+CJS, `dts: true`, `clean: true`, `external: ['react','ink']`) and CLI (`src/cli/cli-main.ts` → `dist/cli.js`, ESM-only, `clean: false`, `esbuildOptions.jsx = 'automatic'` for the `.tsx` UI files pulled in transitively). **Never put `#!/usr/bin/env node` literally in a source file** — tsup's `banner.js` option adds it; doing both produces a duplicate shebang that breaks execution (this has happened once already). Dynamic `import('@aws-sdk/...')`/`import('@google-cloud/...')` calls in `providers/*/sdk-loader.ts` are left as genuine runtime dynamic imports by esbuild rather than bundled — verify this hasn't regressed after touching the provider SDK-loading code: `grep -c '@aws-sdk\|@google-cloud' dist/cli.js` should only match the import-string literals and install-hint text, never actual vendored SDK source (dist/cli.js size shouldn't jump by more than a few KB from provider changes alone).

### Testing conventions

- **Real filesystem fixtures, not mocks** — `test/fixtures/build-tmp-tree.ts`'s `buildTree()`/`cleanupTree()` create/remove real temp dirs via `mkdtempSync`. Don't mock `fs` for scanner/walk/rule tests.
- **Cloud provider tests are the deliberate exception to "real fixtures, not mocks"** — there's no real AWS/GCP account in CI. AWS: `aws-sdk-client-mock`'s `mockClient(SomeClient)` (purpose-built for `@aws-sdk/client-*`); note `.rejects()` always normalizes to a real `Error` instance, so testing a genuinely non-Error rejection needs `.callsFake(() => Promise.reject('raw string'))` instead. GCP: no equivalent client-mock package exists, so `@google-cloud/compute`/`@google-cloud/container` are mocked directly via `vi.mock()` with hand-written fake client classes — **the fake class constructor must be a `function`, not an arrow function**, since vitest's mock `new`-support invokes the implementation via `Reflect.construct`, which throws on an arrow function (no `[[Construct]]`).
- **`fileParallelism: false`** (`vitest.config.ts`) — tests spawn real `du` child processes; parallel file execution exhausts `posix_spawn` on macOS.
- **Mocking ESM modules** — `vi.spyOn` cannot redefine a live ESM namespace export (`Cannot redefine property`). Use `vi.mock('module', async (importOriginal) => { const actual = await importOriginal(); return { ...actual, fn: vi.fn(actual.fn) }; })` at module load time instead, then grab the mock via `vi.mocked(...)` after the dynamic `await import(...)` of the module under test. See `src/cli/cli.test.ts` and `src/cli/headless-scan-error.test.ts`.
- **`scan()` swallows its own fs errors internally** — `headless.ts`'s catch block around its `for await` loop is otherwise unreachable. Test it by mocking `../scan/scanner.js`'s `scan` to throw (dedicated file: `headless-scan-error.test.ts`). The same "mock a throwing async generator" pattern covers `discoverAwsResources`/`discoverGcpResources`/`loadProvider` failures in `headless-cloud.test.ts`.
- **Abort timing** — don't rely on inter-project/inter-directory navigation timing for "aborts mid-scan" tests; it's genuinely racy. Use multiple matching dirs as *siblings in one directory* with `concurrency: 1` so p-limit's queuing is deterministic (only the first task runs immediately, the rest are provably still queued) — see `scanner.test.ts`.
- **`Array.prototype.sort` doesn't invoke its comparator for arrays of length ≤ 1**, and for length 2 calls it exactly once with the operands in original array order — when testing a sort comparator's null-coalescing branches, you need entries in both orderings (two test cases with swapped discovery order) to hit both operand positions. See `headless-null-size.test.ts` / `headless-null-size-reverse.test.ts`, and `headless-cloud.test.ts`'s equivalent pair for the cost-based sort.
- **TUI tests needing real Ink internals** (e.g. asserting `waitUntilExit()` actually resolves, not just that reducer state changed) can't use `ink-testing-library`'s `render()` since it doesn't expose `waitUntilExit`. Construct a minimal fake stdin/stdout (EventEmitter + `isTTY`/`setRawMode`/`read()`/`ref`/`unref`) and call `ink`'s real `render()` directly — see `App.test.tsx`'s quitting test. This is why `vitest.config.ts` sets **`disableConsoleIntercept: true`**: Vitest 4's default console-capturing proxy lacks a `.Console` constructor, and Ink's real `render()` calls `new console.Console(...)` internally (via `patch-console`) — without this flag that test throws `console.Console is not a constructor`.
- **`/* v8 ignore ... */` hints are precise about *what* they exempt, and this matters more since the `@vitest/coverage-v8` v4 rewrite (on `ast-v8-to-istanbul`) maps them more strictly than v3 did — several `next N`-line ignores that used to cover a whole `if`/`return` block silently stopped applying to some of those lines after the v3→v4 upgrade, dropping coverage below 100% with no code change. Prefer the narrowest hint for what's actually unreachable: `v8 ignore else` right before an `if` for a branch that's never false (see `scanner.ts`'s xcode-detector check, `size.ts`'s du-output parse), `v8 ignore next` for a single unreachable statement, `v8 ignore start`/`stop` for a multi-line block — and re-run `npm run coverage` after any coverage-tooling bump to catch ignores that stopped applying.
- **Asserting on ANSI color codes in `ink-testing-library` output** — Ink colorizes through a shared `chalk` singleton, and chalk auto-detects color support from the *real* `process.stdout`, not the fake streams `ink-testing-library` renders into. Under vitest (non-TTY) that means color output is silently disabled and any ANSI-code assertion vacuously passes. Set `chalk.level = 1` at the top of the test file before rendering to force it on (see `App.test.tsx`'s row-highlight-color test).
- Manually driving the built TUI to reproduce a real bug requires a pty (`python3`'s `pty.fork()`, or `script`) — piped stdin can't enable raw mode, so `child_process.spawn` with plain pipes fails with "Raw mode is not supported." `pty.fork()` also doesn't set a window size by default, so `process.stdout.columns`/`.rows` read `0` inside it — an unset winsize produces a garbled character-per-line render that looks like a real bug but isn't one. Set it explicitly *before* the child writes anything: `fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))`, then `os.kill(pid, signal.SIGWINCH)` for any size change after startup.
- **CI runs one extra check beyond the local verify command**: `.github/workflows/ci.yml`, after build, greps `src/` for `from 'react'`/`from 'ink'` outside `src/ui/` (the isolation boundary, enforced in CI not just convention) and then runs a headless smoke test — `npx tsx test/fixtures/ci-smoke-fixture.ts` builds a real fixture tree (a node_modules/dist pair plus a Pods+Podfile gated pair) and pipes its path into `node dist/cli.js <path> --json --dry-run`, asserting `entries.length >= 2`. This is the only place the built `dist/cli.js` is actually exercised end-to-end; it'll miss anything that passes unit tests but breaks in the tsup-built output. It does not exercise the cloud provider paths (no real AWS/GCP account in CI).
- **Diagnosing redraw/resize corruption needs a real terminal emulator, not a text dump.** Stripping ANSI codes from raw output and reading it as text only shows you *what Ink sent*, not what the terminal screen actually looks like after cursor-based overwrites — which is exactly where redraw-desync bugs (see "must never render more lines than the terminal has rows" above) live. Feed the pty's raw bytes through `pyte` (`pip install pyte`; `pyte.Screen(cols, rows)` + `pyte.ByteStream(screen).feed(data)`) and read `screen.display` — a real emulated grid — to see genuine leftover artifacts, mangled borders, etc. Call `screen.resize(rows, cols)` in lockstep with `TIOCSWINSZ` so the emulator's buffer matches what the real terminal would do.

### Releasing

Tag-push triggered: bump `version` in `package.json`/`package-lock.json` (`npm version patch|minor --no-git-tag-version`), commit, push to `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z` — `.github/workflows/release.yml` runs `npm publish --provenance --access public` on any `v*` tag push. `NPM_TOKEN` is already configured on the repo and this flow has published successfully multiple times; the pre-flight `NPM_TOKEN` checklist in `CONTRIBUTING.md` is for a from-scratch repo, not a live concern here.

Full architecture/decision history lives in `AGENTS.md` (durable conventions) — read it too before making structural changes.
