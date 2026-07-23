# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-07-23

### Fixed
- Scans on real directory trees with more than `concurrency` (default 8) matches would hang forever. `DuBatcher`'s batch flush was scheduled on the same `p-limit` instance as the outer per-match task awaiting it, so once concurrency-many matches were in flight, every slot was held by a task blocked on a flush that could never itself acquire a slot to run — a `p-limit` reentrant deadlock. `DuBatcher` now uses its own independent limiter.

## [0.1.0] - 2026-07-22

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

## [0.0.8] - 2026-07-22

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

## [0.0.7] - 2025-06-14

### Fixed
- Type safety, exit code, and dead code cleanup
- Robustness hardening across scanner, walker, deleter, and formatter
- Defensive `formatBytes` guard

## [0.0.6] - 2025-06-14

### Fixed
- Honor `--dry-run`/`--config`/`--no-gated`/`--targets`/`--exclude`/`--min-size`/`--sort` in the TUI
- Stop treating top-level artifact-named dirs as projects to walk into

## [0.0.5] - 2025-06-13

### Fixed
- Cascading multi-box corruption after several resizes (root-caused with a real terminal emulator)
- Resize-artifact and header-height-shift bugs, plus a broader wrap audit

## [0.0.4] - 2025-06-13

### Added
- Resize handler + follow-up UI/UX audit (help, page nav, animated spinner, responsive columns)

## [0.0.3] - 2025-06-12

### Changed
- Redesigned TUI as a real table with full-row selection highlighting
- Renamed package to unscoped `purgeit` so `npx purgeit` works

### Fixed
- `q` never exited the process, sort keybindings were no-ops, and warnings were dropped

## [0.0.1] - 2025-06-12

### Added
- Initial release: CLI dispatch, Ink TUI, headless runner, rule engine, config system, scanner, deleter
- CI/CD pipeline with GitHub Actions
- Interactive TUI with sortable table, multi-select, and confirmation flow
- Headless mode with `--json`/`--delete` flags
- Configurable rules via `purgeit.config.{ts,js,json}`
- Two scan modes: projects (default) and flat (`--full`)
