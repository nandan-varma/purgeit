# purgeit — handoff for continuation

Session ran out of budget mid-milestone-6. This document has everything a fresh
session needs to pick up exactly where this left off. Read this fully before
touching code.

## What this project is

`@nandan-varma/purgeit` — an npx-runnable, interactive, safe, configurable CLI
that finds and deletes regenerable dev build artifacts (node_modules, dist,
target, Pods, ...) across a directory of many projects. It's a ground-up
TypeScript/Ink rewrite of a working bash prototype at `~/dev/CLEANUP.sh`
(read that file — it's the source of truth for the safety algorithm).

**The full approved plan is at `/Users/nandan/.claude/plans/encapsulated-cuddling-lighthouse.md`.
Read it in full before doing anything else — it has the complete architecture,
rationale, CLI flag spec, config schema, and milestone list.** This handoff
summarizes deltas/decisions made *during* implementation that refine or
correct that plan; the plan file is still the primary design doc.

Key decisions locked in with the user (do not revisit):
- Ink (React) for the TUI — first use of a TUI framework in this user's toolkit.
- Deletion is permanent (no trash/undo) — safety comes from multi-select +
  explicit confirm, nothing selected by default.
- User-configurable rules file layered on top of built-in CLEANUP.sh-derived
  defaults (cosmiconfig-based).

## Repo location & state

`~/dev/purgeit` — a real directory with `npm install` already run
(`node_modules/` present, gitignored). `git init` was run and an initial
`git add -A` was done early on, **but nothing has ever been committed** — the
user has not asked for a commit yet. Don't commit unless asked.

Do NOT delete/recreate the repo. Just `cd ~/dev/purgeit` and continue.

## How to verify your work at every step

```bash
cd ~/dev/purgeit
npm run typecheck   # tsc --noEmit
npm run lint:fix     # biome check --write src/ (then npm run lint to confirm clean)
npm test             # vitest run
npm run coverage     # vitest run --coverage — MUST be 100% stmts/branches/funcs/lines
                      # except src/ui/** which is excluded from the threshold (not built yet)
npm run build        # tsup — builds dist/index.{js,cjs,d.ts} + dist/cli.js
```

**Coverage is enforced at 100%** (vitest.config.ts thresholds) for everything
except `src/ui/**`. This is the house convention (matches `~/dev/platex`).
Every milestone in this session was driven to 100% before moving on — keep
doing that. When a branch is genuinely unreachable by design (defensive
guards, redundant checks), use a `/* v8 ignore next N -- reason */` comment
rather than contorting a test — there are several precedents already in the
codebase (see `src/rules/merge.ts`'s GATED_NAMES sanity check, and
`src/scan/scanner.ts`'s `AsyncQueue` class) — but always prefer a real test
first; only ignore after confirming it can't be triggered.

## Package conventions established (already applied, keep following them)

- `package.json`: name `@nandan-varma/purgeit`, `"bin": {"purgeit": "dist/cli.js"}`,
  `"type": "module"`, `engines.node >= 20` (forced by ink@6's own requirement).
  Dependencies already installed: `cosmiconfig@^9.0.2`,
  `cosmiconfig-typescript-loader@^6.3.0`, `ink@^6.8.0`, `p-limit@^7.3.0`,
  `react@^19.2.7`, `react-devtools-core@^6.1.2`. Dev deps include
  `ink-testing-library@^4.0.0` (not yet used — needed for milestone 8),
  `@biomejs/biome`, `vitest`, `@vitest/coverage-v8`, `tsup`, `typescript`.
- `tsup.config.ts`: two build entries — library (`src/index.ts` → ESM+CJS+dts,
  `external: ['react','ink']`) and CLI bin (`src/cli/cli-main.ts` → ESM-only,
  shebang banner via tsup's `banner` option — **do NOT put a shebang literally
  in the source file, tsup adds it and you'll get a duplicate shebang bug**,
  which happened once already and was fixed).
- `tsconfig.json`: strict, `exactOptionalPropertyTypes: true`,
  `noUncheckedIndexedAccess: true`, `NodeNext`/`NodeNext`, `jsx: "react-jsx"`.
  **Important gotcha already solved**: `rootDir` is NOT set (removed it) and
  `include` covers both `src/**/*` and `test/**/*`, because
  `test/fixtures/build-tmp-tree.ts` lives outside `src/` and TS's `rootDir`
  constraint used to break on it. Don't re-add `rootDir: "src"`.
- **`exactOptionalPropertyTypes` gotcha** (bit us multiple times): any
  interface field that's optional AND gets assigned a value of type `T |
  undefined` (e.g. `signal?: AbortSignal` fed by `opts.signal` which is
  `AbortSignal | undefined`) must be declared as `field?: T | undefined`, not
  just `field?: T`. Every options interface in this codebase
  (`WalkOptions.signal/maxDepth`, `ScanOptions.signal/targetProject/maxDepth`,
  `DeleteOptions.signal`, `LoadConfigOptions.*`) already has this fix applied.
  Apply the same pattern to any new options interface.
- Biome: 2-space, single quotes, trailing commas — just run `lint:fix`, don't
  hand-format.
- Vitest: `fileParallelism: false` (real subprocess/filesystem tests), coverage
  thresholds 100% excluding `src/ui/**` and `*.test.ts`/`types.ts`.

## Architecture built so far (milestones 1–5 complete, 100% coverage each)

```
src/
  types.ts              — GateContext, Gate, ArtifactRule, ProjectTypeDetector,
                           ValidationWarning, Validator, ResolvedRuleSet
  format.ts              — parseSizeString(), formatBytes() — shared pure utils,
                           framework-agnostic, used by headless.ts and (later) ui/
  index.ts                — currently just a scaffold placeholder export
                           (VERSION_PLACEHOLDER) — NEEDS TO BECOME the real
                           public library API per the plan (export scan, rule
                           types, config loader) before first publish. Not
                           done yet — low priority, do near the end.
  rules/
    default-rules.ts     — ALWAYS_SAFE_NAMES / GATED_NAMES / PRUNE_META_NAMES,
                           ported verbatim from CLEANUP.sh. NOTE: CLEANUP.sh's
                           SKIP_DIRS (Claude, Snippets, memory, _tmp_clone, tmp)
                           was deliberately NOT ported as a package default —
                           those are this user's personal folder names, not a
                           generic safety rule. defaultRuleSet().skipDirs starts
                           EMPTY. The user's own ~/dev config (a purgeit.config.*
                           at ~/dev) should set skipDirs to those names — this
                           is milestone 12's job (dogfooding), not done yet.
    gate-context.ts       — GateContext factory (createGateContext) +
                           globToRegExp() (shared glob matcher, `*`/`?` only)
    gate-conditions.ts    — podsGate/buildGate/gradleGate/binObjGate, ported
                           1:1 from CLEANUP.sh's gate_allows()
    project-types.ts      — detectProjectTypes(), findTopLevelMatchName()
                           (exported, reused by scanner.ts for xcodeproj lookup)
    validators.ts          — validatePackageJson/NextConfig/CargoToml/
                           PackageSwift/Podfile/Xcodeproj — warn-only, ported
                           from CLEANUP.sh's validate_* functions
    merge.ts                — defaultRuleSet(), mergeRuleSets(base, userConfig),
                           restrictRuleSetToTargets(ruleSet, tokens) (for
                           --targets CLI flag, added during milestone 6)
  config/
    schema.ts              — PurgeitUserConfig, GateCondition, UserGatedRule,
                           compileGateConditions(), evaluateGate(),
                           assertPurgeitUserConfig() (full runtime validation
                           with descriptive errors)
    resolve.ts              — loadConfig() via cosmiconfig, with a
                           cosmiconfig-typescript-loader wired in for
                           .ts/.mts/.cts config files. searchPlaces covers
                           purgeit.config.{js,ts,mjs,cjs,json}, .purgeitrc(.json),
                           and a "purgeit" key in package.json.
  scan/
    walk.ts                 — hand-rolled stack-based DFS (NOT fs recursive:true
                           — needed selective pruning). Has maxDepth support
                           (added mid-milestone-6 for --depth flag). Never
                           follows symlinks. Two-phase: always-safe matches
                           stop recursion; gated matches evaluate their gate
                           and also stop recursion regardless of gate result
                           (matches CLEANUP.sh's two-pass find -prune design).
    size.ts                  — computeSize(): du -s -k by default (feature-
                           detected once, cached — resetDuAvailabilityCache()
                           exported for tests), falls back to a p-limit(8)
                           pure-Node recursive stat-sum walk if du is
                           unavailable or fails on a specific path.
    scanner.ts               — scan(root, ruleSet, opts): AsyncGenerator<ScanEvent>.
                           Internal AsyncQueue class bridges concurrent size
                           computations (progressive found→size two-phase
                           emission) into a single ordered event stream.
                           'projects' mode (default) vs 'flat' mode (--full).
                           Has maxDepth wired through to both modes.
  delete/
    deleter.ts               — deleteEntries(paths, opts): AsyncGenerator<DeleteEvent>.
                           Dry-run vs real fs.rm, partial-failure aggregation,
                           PLUS a safety guard (isDangerousPath) refusing to
                           delete filesystem root or the user's home directory
                           — this is purgeit's own addition beyond the plan,
                           cheap insurance given the "really really safe" goal.
  cli/
    cli-main.ts              — STILL THE MILESTONE-1 PLACEHOLDER
                           ("purgeit: scaffold placeholder\n"). Needs to become
                           the real thin executable entrypoint in milestone 7
                           (SIGINT→AbortController wiring around cli.ts's
                           runCli, mirroring platex/src/cli-main.ts exactly).
    args.ts                  — DONE. parseCliArgs(argv): ParsedCli | 'help' |
                           'version', full USAGE text, full flag surface from
                           the plan (-d/--directory, --full, --project,
                           --exclude repeatable, --targets comma-list,
                           --min-size, --depth, --config, --no-config,
                           --no-gated, --sort, --asc, --dry-run, --delete,
                           -y/--yes, --json, --tui, --headless, --concurrency,
                           --color/--no-color, -h/--help, -V/--version).
                           Validates: sort enum, --tui+--headless conflict,
                           --color+--no-color conflict, --config+--no-config
                           conflict, positional-vs---directory conflict,
                           positive-int depth/concurrency.
    headless.ts               — DONE but has 4 coverage gaps not yet closed
                           (see "IMMEDIATE NEXT STEPS" below). runHeadless(
                           parsed: ParsedCli, io: HeadlessIO): Promise<number>
                           — resolves config, merges+restricts ruleset
                           (no-gated, targets), runs scan() with exclude-glob
                           filtering + min-size filtering + sorting, then
                           either --json output, a text preview list, or
                           (--delete) a confirm-then-delete flow using
                           deleteEntries(). Injectable IO (stdout/stderr/cwd/
                           signal/confirm) mirrors platex's runCli(argv, io)
                           pattern. Exit codes: 0 success, 1 nothing found /
                           deletion had failures, 2 usage or environment error.
```

Every file above has a colocated `*.test.ts` except `index.ts` (has a trivial
placeholder test) and `cli-main.ts` (has a trivial placeholder test — will be
replaced with the real SIGINT-wiring test in milestone 7, same pattern as
`platex/src/cli-main.test.ts` — read that file for the exact mocking pattern
to copy, it's already been read once this session and confirmed to be the
right template).

## Task list state (use TaskList/TaskGet to resync, IDs may have shifted)

1. Scaffold purgeit package — **completed**
2. Build rule engine (src/rules/*) — **completed**
3. Build config resolution (src/config/*) — **completed**
4. Build scanner core (src/scan/*) — **completed**
5. Build deleter (src/delete/*) — **completed**
6. Build CLI flags + headless runner — **in_progress, ~90% done, see below**
7. Build cli.ts/cli-main.ts TTY dispatch — **pending**
8. Build Ink UI (src/ui/*) — **pending** (the biggest remaining piece)
9. Write docs (README, CONTRIBUTING) — **pending**
10. Set up CI workflow — **pending** (a basic ci.yml already exists from
    milestone 1 scaffolding — typecheck→lint→coverage→build→react/ink isolation
    grep check — but it's missing the headless smoke test described in the
    plan; add that in milestone 10)
11. Set up release workflow — **pending** (no release.yml yet)
12. Dogfood against ~/dev and verify — **pending** (this is also where the
    user's personal skipDirs config for ~/dev gets written, see note above)

## IMMEDIATE NEXT STEPS (resume milestone 6 here)

Last coverage run showed these gaps (run `npm run coverage` to reconfirm exact
line numbers — they may have shifted slightly):

```
src/format.ts        94.44% | 83.33% branch | uncovered: lines 23-24
src/cli/headless.ts  90.47% | 82.85% branch | uncovered: lines 20-29, 104-106, 174
```

**1. `src/format.ts` lines 23-24** — the `!Number.isFinite(value) || value < 0`
throw inside `parseSizeString`. The existing test `'throws on a negative
number'` passing `'-5MB'` does NOT actually hit this branch — the regex
`/^([\d.]+)\s*([a-zA-Z]*)$/` requires the string to *start* with a digit or
dot, so `-5MB` fails the regex match entirely and hits the *earlier* "no
match" throw instead (dead test, false positive). To actually hit the
`isFinite`/`value < 0` branch, you need an input that matches the regex's
character class but produces `NaN` from `Number.parseFloat` — e.g. a bare
`"."` (matches `[\d.]+`, but `Number.parseFloat('.')` is `NaN`). Add a test:
`expect(() => parseSizeString('.')).toThrow(/invalid size/)`. The `value < 0`
half of that condition is likely genuinely unreachable (the regex can't
produce a negative parseFloat) — after adding the NaN test, re-run coverage;
if `value < 0` is still flagged, simplify the condition to just
`!Number.isFinite(value)` and drop the dead `|| value < 0`, OR mark it with a
`/* v8 ignore next */` if you prefer to keep it as documentation of intent.

**2. `src/cli/headless.ts` lines 20-29** — this is the entire `defaultConfirm`
function (the real `readline/promises`-based stdin prompt used when the
caller doesn't inject `io.confirm`). All current tests always inject
`confirm`, so this real-stdin code path has never executed. Fix: add a test
that mocks `node:readline/promises` (same pattern as `src/scan/size.test.ts`'s
`vi.mock('node:child_process', ...)` — use `vi.mock('node:readline/promises',
() => ({ createInterface: vi.fn(() => ({ question: vi.fn(async () => 'y'),
close: vi.fn() })) }))`) and calls `runHeadless` WITHOUT passing `confirm` in
the io object (but DO still pass `stdout`/`stderr` to capture output, and
pass `delete: true` without `yes` to force the confirm path). Assert it
proceeds to delete when the mocked answer is `'y'`/`'yes'` and aborts on
anything else.

**3. `src/cli/headless.ts` lines 104-106** — the `try/catch` wrapped around
`for await (const event of scan(...))`. This is very likely **unreachable by
design**: `scan()` (and everything it calls — `walk()`, `listProjects()`)
already swallows its own fs errors internally and never throws/rejects. A
test was attempted earlier this session to trigger this (pointing at a
non-directory path) and it turned out `listProjects` just returns `[]` instead
of throwing — confirming the catch is currently dead code. Two options:
  (a) **Recommended**: mock the scanner module itself to force a throw —
      `vi.mock('../scan/scanner.js', async (importOriginal) => { const actual
      = await importOriginal(); return { ...actual, scan: vi.fn(async
      function* () { throw new Error('boom'); }) }; })` in a dedicated test
      file/describe block, then assert `runHeadless` returns exit code 2 and
      prints the error to stderr. This is honest coverage of real defensive
      code (scan() *could* be changed later to throw, e.g. if config
      resolution moved inside the loop).
  (b) Simplify: remove the try/catch since it's currently unreachable, and
      re-add it later if scan() ever gains a throwing code path. This is
      simpler but slightly less defensive.
  Pick (a) unless it feels like overkill — it's the same technique already
  used successfully in `src/scan/size.test.ts` for mocking `node:child_process`.

**4. `src/cli/headless.ts` line 174** — almost certainly the default
`stdout`/`stderr` arrow functions (`io.stdout ?? ((text) => process.stdout
.write(...))`) — every test so far injects both `stdout` and `stderr`
explicitly via `captureIO()`, so the real `process.stdout.write`/`process
.stderr.write` defaults have never executed. Fix: add one test that calls
`runHeadless(baseArgs({...}))` with **no io object at all** (or an io object
missing `stdout`/`stderr` specifically), spy on `process.stdout.write` /
`process.stderr.write` via `vi.spyOn(process.stdout, 'write').mockImplementation(() => true)`
(restore after), and assert it was called. Match the style already used in
`src/cli/cli-main.test.ts` for spying on `process.stdout.write`.

After closing these 4 gaps, run the full `npm run coverage` and confirm
**100% across every metric for every file outside `src/ui/`**, then mark task
6 completed via `TaskUpdate`.

## Milestone 7 — cli.ts / cli-main.ts (next after 6)

Read `~/dev/platex/src/cli.ts` and `~/dev/platex/src/cli-main.ts` in full —
they are the exact template. Build:

- `src/cli/cli.ts` — exports `runCli(argv: string[], io: CliIO = {}):
  Promise<number>`. Responsibilities: call `parseCliArgs(argv)` from
  `args.ts`; handle `'help'`/`'version'` (print `USAGE`/version and return 0);
  on a thrown parse error, print to stderr + USAGE and return 2; decide
  TUI-vs-headless dispatch — **TUI only when stdout is a TTY AND none of
  `--json`/`--delete`/`--headless` was passed** (per the plan's exact spec —
  `--tui` forces it regardless of TTY, `--headless` forces the other way);
  headless path just calls `runHeadless` from `headless.ts` and returns its
  exit code; TUI path will call into `src/ui/` (doesn't exist yet — until
  milestone 8 lands, either stub it to fall back to headless with a
  stderr note, or build cli.ts's TUI branch in lockstep with milestone 8).
  Never calls `process.exit` directly — returns the code, exactly like
  platex's `cli.ts`.
- `src/cli/cli-main.ts` — replace the milestone-1 placeholder entirely. Thin
  executable: wire `SIGINT` → `AbortController`, call `runCli(process.argv
  .slice(2), { signal: controller.signal })`, set `process.exitCode`. Copy
  platex's exact pattern (double-Ctrl-C force-quits via `process.exit(130)`
  on the second SIGINT).
- Update `src/cli/cli-main.test.ts` to replace its placeholder test with the
  real mocked-`runCli` SIGINT-wiring test — **copy `platex/src/cli-main.test.ts`
  almost verbatim**, just changing the import path/mock target from `./cli.js`
  (platex) to `./cli.js` (same relative import here too, since our cli.ts
  lives at the same relative path — `src/cli/cli-main.ts` importing
  `src/cli/cli.ts`).
- Update `tsup.config.ts`'s CLI entry — currently points at
  `src/cli/cli-main.ts` already (correct), no change needed there.

## Milestone 8 — Ink UI (the big one)

Full detail is in the plan file's "Ink UI" section — re-read it. Key points
to remember that aren't obvious from a skim:

- **Isolation is CI-enforced**: `.github/workflows/ci.yml` already has a grep
  step checking that no file outside `src/ui/` imports `react` or `ink`. Keep
  it that way — `state.ts` and `format.ts`-equivalents inside `ui/` should be
  plain TS (no JSX) so they're testable without `ink-testing-library`; only
  actual `.tsx` component files need it.
- Directory: `src/ui/{App.tsx, state.ts, useScanner.ts, format.ts,
  components/{Header,ArtifactList,Row,Legend,ConfirmDialog,DeletingProgress,
  DoneSummary}.tsx}`. Plan has the full keybinding table and state shape —
  don't redesign it, just implement it.
- **Nothing selected by default. No delete-on-keypress** (space toggles
  selection; a separate confirm step, reachable only via `enter` with ≥1
  selected, is what actually deletes) — this is the explicit safety
  differentiator vs npkill that the user chose. Don't regress this.
- `useScanner.ts` bridges the `scan()` async generator into a reducer via
  `useEffect` + `for await`, with an `AbortController` created on mount and
  aborted on unmount/quit — reuse `scan()` and `deleteEntries()` from
  `src/scan/scanner.ts` / `src/delete/deleter.ts` directly, don't reimplement
  anything.
- `ink-testing-library` is already a devDependency (`^4.0.0`), not yet used.
  `render()` + `stdin.write()` to simulate keypresses, `lastFrame()` to assert
  rendered output.
- Coverage: `vitest.config.ts` already excludes `src/ui/**` from the 100%
  threshold — UI correctness is asserted via `ink-testing-library` behavior
  tests, not a coverage gate. Still write thorough tests, just don't chase
  100% branch coverage on rendering logic.
- Wire the finished UI into `cli.ts`'s TUI branch once built.

## Milestone 9 — Docs

README needs: badges row, one-line pitch, quick start, full flag reference
(can lift straight from `args.ts`'s `USAGE` constant), config schema docs with
an example `purgeit.config.ts` (use the example already sketched in the plan
file's "Config file schema" section). CONTRIBUTING.md needs the NPM_TOKEN
pre-publish checklist (see milestone 11 below) and a note that the TUI is
verified via `ink-testing-library`, not the CI smoke test.

## Milestone 10 — CI (extend the existing ci.yml)

Current `.github/workflows/ci.yml` (already exists from milestone 1) has:
checkout → setup-node (20, 22 matrix) → npm ci → typecheck → lint → coverage
→ build → react/ink isolation grep check. **Missing**: the headless smoke
test from the plan — build a disposable fixture tree with real artifacts
(node_modules, Pods+Podfile, etc.), run `node dist/cli.js <fixture> --json
--dry-run`, assert the JSON output contains expected matches. Add this as a
final CI step once milestone 7 (cli-main.ts) produces a real working
`dist/cli.js`.

## Milestone 11 — Release workflow

No `.github/workflows/release.yml` exists yet. Mirror
`~/dev/git-fs-s3/.github/workflows/release.yml` and `~/dev/platex`'s release
workflow: tag-triggered (`push: tags: v*`), `npm publish --provenance
--access public`, `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. **Known
pitfall** (already bit the user once on git-fs-s3): the workflow will fail
with `ENEEDAUTH` if the `NPM_TOKEN` repo secret was never actually set on
GitHub. Before the first tag push, verify with `gh secret list --repo
nandan-varma/purgeit`; document manual `npm publish --provenance --access
public` (logged in locally via `npm login`) as the fallback in
CONTRIBUTING.md.

## Milestone 12 — Dogfood

Run `node dist/cli.js ~/dev --json --dry-run` (after building) and diff its
matched paths/sizes against a fresh `~/dev/CLEANUP.sh` dry run — they should
agree except where intentional. **This is also where the user's personal
`skipDirs` (the CLEANUP.sh SKIP_DIRS list: `_tmp_clone`, `tmp`, `Claude`,
`Snippets`, `memory`) should be written into a real `purgeit.config.*` file
at `~/dev`** (NOT baked into the package defaults — see the `default-rules.ts`
note above). Then manually drive the built TUI in a real terminal per the
plan's verification section: scan a subtree with known artifacts, verify
nothing pre-selected, space-toggle a few rows, confirm dialog shows correct
count/size, cancel once to verify no deletion occurred, then confirm-delete
on a **disposable fixture tree, never ~/dev itself**, and verify only
selected paths were removed.

## Things that bit us this session (avoid repeating)

- **Double shebang bug**: don't put `#!/usr/bin/env node` literally in
  `cli-main.ts` source — tsup's `banner.js` option in `tsup.config.ts` already
  adds it; doing both produces two shebang lines and breaks execution.
- **`detectProjectTypes` double-counting bug**: `ResolvedRuleSet` originally
  had a `projectTypeDetectors` field that `merge.ts`'s `defaultRuleSet()` set
  to the *same* `PROJECT_TYPE_DETECTORS` array that `detectProjectTypes()`
  already includes internally by default — passing it as the function's
  "extra detectors" argument caused every label to appear twice (`"node,node"`).
  Fixed by removing `ResolvedRuleSet.projectTypeDetectors` entirely (the
  approved config schema has no `projectTypes` field anyway, so there was
  nothing legitimate to put there). If you ever add user-configurable project
  type detectors, make sure `defaultRuleSet()` starts that field **empty**,
  not equal to the built-ins.
- **`tsconfig.json` `rootDir`**: removed entirely (see conventions section
  above) because `test/fixtures/build-tmp-tree.ts` lives outside `src/` and
  is imported by many `*.test.ts` files.
- **Timing-dependent abort tests are genuinely racy**: when testing "abort
  mid-scan skips pending work," don't rely on inter-project/inter-directory
  navigation timing (it's a real race and flips depending on microtask
  ordering). Instead put multiple matching artifact directories as *siblings
  in one directory* with `concurrency: 1` — this makes p-limit's queuing
  strictly deterministic (only the first task runs immediately; all others
  are provably still queued when you abort right after the first `found`
  event). See `src/scan/scanner.test.ts`'s `'skips pending size computations
  once aborted mid-scan'` test for the working pattern — reuse it if you need
  similar timing-sensitive tests elsewhere (e.g. in the Ink UI's
  `useScanner.ts` tests).
- **`exactOptionalPropertyTypes` + optional fields fed by `| undefined`
  values**: see the dedicated note in the conventions section above. This
  will bite you again in `cli.ts`/`ui/` code — apply the `field?: T |
  undefined` pattern proactively for any new options interface.
- **Headless test fixtures must match scan mode**: in 'projects' mode
  (default), immediate children of the scan root are treated as *projects*,
  not artifacts — a bare top-level `node_modules` dir won't be reported as a
  match, it'll be treated as an (empty-labeled) project container instead.
  `headless.test.ts` was rewritten to default to `full: true` (flat mode) for
  most tests to avoid this trap; keep that pattern for any new headless
  tests that don't specifically care about project-grouping behavior.
- **v8/istanbul coverage-ignore comment placement matters**: `/* v8 ignore
  next N */` counts N lines *after* the comment, and multi-line block
  comments containing the directive can confuse the line count — keep the
  ignore directive as its own short single-purpose comment immediately
  before the ignored line(s), with any longer rationale in a separate plain
  comment above it (see `scanner.ts`'s `AsyncQueue.close()` for the working
  pattern).

## Reference files worth re-reading before continuing

- `~/dev/CLEANUP.sh` — the algorithm source of truth
- `/Users/nandan/.claude/plans/encapsulated-cuddling-lighthouse.md` — the full plan
- `~/dev/platex/src/cli.ts` + `cli-main.ts` + `cli-main.test.ts` — exact
  template for milestone 7
- `~/dev/platex/CLAUDE.md` — general conventions reference (coverage,
  testing philosophy, performance notes) — useful tone/style reference for
  purgeit's own eventual CLAUDE.md if the user wants one later (not yet
  created for this repo)
