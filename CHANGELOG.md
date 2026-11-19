# Changelog

## [0.6.0] - 2026-11-18

### Added
- **Projects, not folders.** The UI and `scan` list one row per project — a git repository (a monorepo is one), a worktree folded into its repository, or a manifest folder — sorted dormant-first. `R` selects everything in dormant projects; `--stale` does the same for `scan`/`clean`; `dormantAfter` (default 30d) sets the threshold. Dormancy comes from git's own log, not artifact mtimes.
- UI: expand/collapse (`→ ←`, `e`/`E`), tri-state project selection, flat/projects toggle (`v`), a 10 MB floor with `m` to show small artifacts, a `?` help overlay, a review grouped by project that warns about recently active and cloud-synced projects.
- `purgeit explain <path>` — why a directory is matched, skipped or protected, using the same checks `clean` runs.
- `purgeit init`, `purgeit completion <bash|zsh|fish>`, `scan --by project|artifact`.
- Config is now discovered by searching upward from the working directory, then `~/.config/purgeit/`; the schema is served at https://purgeit.nandan.fyi/schema.json.
- Reports gain `project*`, `gitIgnored` and `synced` fields on entries and a `projects[]` rollup; with `--format json`, errors are JSON on stdout too.
- Git-ignored evidence and cloud-synced-folder detection (Dropbox, iCloud, OneDrive, Google Drive).
- A new `inside` rule condition (proof from a file inside the directory itself).
- Standalone binaries for macOS, Linux and Windows, a GitHub Release with checksums on every tag, SECURITY.md and issue templates.

### Changed
- **Safer rules.** Names that are also common for authored folders now need proof: `target` (Cargo.toml, pom.xml, build.sbt, Gradle or Anchor manifest), `out`, `coverage`, `test-results` and `.cache` (a project manifest), `venv`/`.venv` (a `pyvenv.cfg` inside), `registry` (a Cargo home). A real scan found these were matching unrelated folders.

## [0.5.1] - 2026-11-18

### Fixed
- Piping output (`purgeit scan | head`) no longer crashes with an `EPIPE` stack trace; it stops quietly.
- `clean` now deletes the *verified real path*, closing a window in which an ancestor swapped for a symlink after the safety check could redirect the delete.
- `SIGTERM` is handled like `SIGINT` (stops starting new work, exit code 130).
- The interactive UI no longer reads refs during render or updates after unmount, and ages advance while it is open.

### Changed
- Smaller and simpler: removed the `ms` dependency and an unused filesystem indirection layer.
- New documentation site on Fumadocs, with every page also served as Markdown (`.md` or `Accept: text/markdown`), `llms.txt`, a searchable rules browser and generated CLI/config references.
- Tooling: Bun, oxlint, `tsgo`, knip, React Doctor, publint and attw behind one `bun run check` gate used by CI and releases; releases publish through npm trusted publishing with provenance.

## [0.5.0] - 2026-11-18 — complete rewrite

Breaking: no compatibility with 0.x flags, config keys or output.

- New commands: `purgeit` (UI), `scan`, `clean`, `rules`, `history`, `skill`. Flags consolidated (`--min-age` replaces `--max-age`/guard window; `--safe-only` replaces `--no-gated`; `--only` replaces `--targets`).
- Safety: every deletion re-verifies rule match, realpath containment, protection, recent activity, and changes since the scan. Anything unverifiable is refused.
- One traversal measures allocated size, file count and last activity; hardlink-aware (pnpm). No more `du`/`find` subprocesses.
- Interactive UI rebuilt on Ink 8's alternate screen with live filter, sort, protected rows and a two-step confirm. Keys are interpreted in the reducer.
- Config: `purgeit.config.*` / package.json `purgeit`, validated with zod, JSON Schema shipped as `purgeit/schema.json`; declarative rules only.
- `scan --format json` doubles as a plan for `clean --plan`.
- Removed: AWS/GCP cloud cleanup, `purgeit docs`, function-valued gates, CommonJS build, project-type labels and manifest validators.
- ESM only; Node 22+; built with tsdown.

The format follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## Earlier releases (0.x)

### [0.1.1] - 2026-07-23

### Fixed
- Scans on real directory trees with more than `concurrency` (default 8) matches would hang forever. `DuBatcher`'s batch flush was scheduled on the same `p-limit` instance as the outer per-match task awaiting it, so once concurrency-many matches were in flight, every slot was held by a task blocked on a flush that could never itself acquire a slot to run — a `p-limit` reentrant deadlock. `DuBatcher` now uses its own independent limiter.

### [0.1.0] - 2026-07-22

### Fixed
- `DuBatcher`'s flush timer is no longer `unref()`'d — it let Node exit before the batched `du` flush fired when the timer was the only remaining handle (short-lived headless scans), leaving `computeSize()` promises unsettled forever. Surfaced in CI as the smoke test exiting with code 13 (Node's unsettled top-level await detection) instead of completing the scan.
- Docs site: removed global Open Graph/Twitter head overrides that clobbered Starlight's per-page `og:title`/`og:description`/`og:url`/`twitter:*` tags with the homepage's fixed values on every other page

### Added
- Docs site: sitewide `SoftwareApplication` JSON-LD structured data
- Docs site: `robots.txt` pointing at the existing sitemap

### Changed
- `homepage` in `package.json` now points to the hosted docs site (`https://purgeit.nandan.fyi`)
- Expanded npm `keywords` for discoverability
- README links the hosted docs near the top

### [0.0.8] - 2026-07-22

### Added
- Cross-platform CI matrix (macOS, Linux, Windows)
- Cross-platform documentation in README
- Expanded library API exports (`deleteEntries`, `Gate`, `GateContext`, `PurgeitUserConfig`, `GateCondition`, `UserGatedRule`, `createExcludeMatcher`)
- `typescript` peer dependency now marked optional
- New library API exports: `restrictRuleSetToTargets`, `applyCliFilters`, `LoadConfigOptions`, `LoadedConfig`
- New docs pages: built-in rules reference, FAQ & troubleshooting
- Improved docs site metadata (Open Graph / Twitter Cards, sitemap, last updated timestamps)

### Fixed
- README badge now points to correct `purgeit` package name
- `isDangerousPath` now correctly rejects Windows drive roots (e.g. `C:\`)
- `skipDirs` entries now properly pruned during recursive walks, not just at top-level project listing
- `chmod`-based permission tests guarded on Windows (no-op on NTFS)
- Corrected config examples in README and docs (removed misleading `alwaysSafe`/`alwaysSafeRemove` usage)

### Changed
- Lazy-load `cosmiconfig-typescript-loader` (saves 1.7MB `jiti` install for non-TS config users)
- Batch `du -s -k` calls via `DuBatcher` (reduces process forks from O(n) to O(n/32))
- Memoize `sortedEntries` in ArtifactList (skip re-sort on every 80ms spinner tick)
- O(1) `selectedBytes` lookup via path-to-entry Map in Header
- Efficient `UPDATE_SIZE` reducer (single-element replacement instead of full array map)
- Cache compiled glob regexes in gate-context

### [0.0.7] - 2025-06-14

### Fixed
- Type safety, exit code, and dead code cleanup
- Robustness hardening across scanner, walker, deleter, and formatter
- Defensive `formatBytes` guard

### [0.0.6] - 2025-06-14

### Fixed
- Honor `--dry-run`/`--config`/`--no-gated`/`--targets`/`--exclude`/`--min-size`/`--sort` in the TUI
- Stop treating top-level artifact-named dirs as projects to walk into

### [0.0.5] - 2025-06-13

### Fixed
- Cascading multi-box corruption after several resizes (root-caused with a real terminal emulator)
- Resize-artifact and header-height-shift bugs, plus a broader wrap audit

### [0.0.4] - 2025-06-13

### Added
- Resize handler + follow-up UI/UX audit (help, page nav, animated spinner, responsive columns)

### [0.0.3] - 2025-06-12

### Changed
- Redesigned TUI as a real table with full-row selection highlighting
- Renamed package to unscoped `purgeit` so `npx purgeit` works

### Fixed
- `q` never exited the process, sort keybindings were no-ops, and warnings were dropped

### [0.0.1] - 2025-06-12

### Added
- Initial release: CLI dispatch, Ink TUI, headless runner, rule engine, config system, scanner, deleter
- CI/CD pipeline with GitHub Actions
- Interactive TUI with sortable table, multi-select, and confirmation flow
- Headless mode with `--json`/`--delete` flags
- Configurable rules via `purgeit.config.{ts,js,json}`
- Two scan modes: projects (default) and flat (`--full`)
