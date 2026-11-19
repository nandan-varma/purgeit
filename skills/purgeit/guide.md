# purgeit — guide for agents

purgeit finds regenerable build artifacts (node_modules, target, dist, Pods, …) and deletes them
safely. Prefer the commands below to deleting directories yourself.

## Workflow

1. **Look first.** `purgeit scan [dirs…] --format json` lists candidates and deletes nothing.
   Add `--min-size 50MB`, `--min-age 30d`, `--only node_modules,target` to narrow it.
2. **Review.** Each entry has `path`, `rule`, `bytes`, `lastActive` (epoch ms) and `protection`.
   Entries with `protection` set are never deleted. Show the user the list and total before acting.
3. **Delete only what the user approved.** Trim the report to the approved entries and run
   `purgeit clean --plan plan.json --yes`, or run `purgeit clean [dirs…] --yes` with the same filters.
   Use `--dry-run` to preview.

## Safety you can rely on

- Every path is re-verified at deletion time: a rule must still claim it, it must resolve inside the
  scanned roots, hold no git-tracked files, nested repositories or `*-keypair.json`, and have no
  changes since the scan.
- `clean` skips anything modified within `--min-age` (default `7d`). Do not lower it unless the user asks.
- Nothing is deleted without `--yes` (or an interactive confirmation).

## Output and exit codes

- `scan --format json` → `{version, roots, entries[], summary}`; `--format ndjson` streams events.
- `clean --format json` → `{dryRun, deleted[], refused[], failed[], summary}` (needs `--yes` or `--dry-run`).
- Exit `0` success · `1` some paths skipped or failed, or the user declined · `2` bad usage or config · `130` interrupted.

## Other commands

- `purgeit rules [--category rust] [--format json]` — what is matched, and the proof gated rules need.
- `purgeit history [-n 20] [--format json]` — what has been deleted.
- Configuration lives in `purgeit.config.{ts,json,…}` or the `purgeit` key of package.json; the JSON Schema
  ships as `purgeit/schema.json`.
