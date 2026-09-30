---
title: CLI reference
description: Command-line options for purgeit.
---

> The installed CLI is the canonical, version-matched reference for people and agents:
> `purgeit docs` serves every page of this site, `purgeit agent instructions` the operating
> workflow, and `purgeit agent schema` the JSON contract.

## Commands

```bash
purgeit [command] [directory...] [options]
```

| Command | What it does |
| --- | --- |
| `scan [directory...]` | Find artifacts without changing disk. Prints a table in a terminal and JSON when piped (`--format table\|json\|jsonl` to choose). The default outside a terminal. |
| `tui [directory]` | Open the [interactive review UI](/tui/) on one directory. The default in a terminal. |
| `plan [directory...] --include <path> --output <file>` | Write an explicit deletion plan of the matches under the `--include` paths (relative to their root). |
| `apply --plan <file> [--yes] [--min-age <duration>]` | Re-check every planned entry and delete what still qualifies (see [Safety checks](#safety-checks)). |
| `docs [topic] [--json]` | List the documentation pages, or print one (e.g. `purgeit docs rules`) — always the pages matching the installed version. |
| `history [--json] [--limit <n>]` | Show what purgeit deleted or failed to delete, newest first (see [Deletion history](#deletion-history)). |
| `agent <instructions\|schema>` | The operating guide and JSON schema for agents and CI. |
| `skills <list\|get> [name]` | Agentic-skill content for AI coding agents. |

Without a command, purgeit opens the TUI in a terminal and scans otherwise.

If no directory is given, the current working directory is used. Pass directories as positional arguments (several are allowed) or one via `-d`/`--directory`, not both. `--discover` adds your usual project folders — see [Scanning several folders](#scanning-several-folders).

## Options

| Flag | Description |
| --- | --- |
| `-d, --directory <path>` | Root directory to scan (default: cwd). Several directories can instead be passed as positional arguments. |
| `--discover` | Also scan the usual project folders under your home directory — see [Scanning several folders](#scanning-several-folders) |
| `--include <glob>` | Keep only matches under this path, relative to their root (repeatable; required by `plan`) |
| `--full` | Flat scan mode: treat the root as one scan unit instead of grouping immediate children as separate projects |
| `--project <name>` | Limit to a single top-level project by name (projects mode only) |
| `--exclude <glob>` | Exclude paths matching the glob, relative to the scanned root (repeatable) |
| `--targets <names>` | Comma-separated rule names or a named target group to restrict matching to |
| `--min-size <size>` | Skip matches below this size (e.g. `10MB`, `500KB`) |
| `--min-age <duration>` | Skip matches newer than this age (e.g. `7d`, `24h`). Locally a match must be older *and* have nothing inside it modified within the window; for cloud resources it applies to `createdAt`. With `--delete` or `apply` it also sets the [recency guard](#safety-checks) window (`0` disables it). |
| `--max-age <duration>` | Skip matches older than this age (e.g. `30d`) |
| `--include-empty` | Also list zero-byte artifacts, which are hidden by default since deleting them frees nothing |
| `--depth <n>` | Max recursion depth below each scanned root (default: unlimited) — local only |
| `--provider <local\|aws\|gcp>` | Resource domain to scan (default: `local`). `aws`/`gcp` scan cloud resources instead of local directories and always run headless — see [Cloud cleanup](/cloud/) |
| `--region <region>` | AWS region (`--provider aws` only; GCP always discovers across every zone/location in the project) |
| `--aws-profile <name>` | AWS credential profile (`--provider aws` only) |
| `--gcp-project <id>` | GCP project id, required for `--provider gcp` |
| `--tag <key=value>` | Tag/label filter, repeatable — AND semantics (aws/gcp only; defaults from config's `cloud.tagKey`/`cloud.tagValue`, else `purgeit-managed=true`) |
| `--with-cost` | Fetch billed cost estimates during cloud discovery (`--provider aws` only; not yet supported for gcp) |
| `--config <path>` | Explicit config file path (skips upward search) |
| `--no-config` | Ignore any discovered config file (built-in defaults only) |
| `--no-gated` | Disable gated-rule evaluation (always-safe rules only, local only) |
| `--sort <size\|path\|name>` | Sort key for list/JSON output (default: `size`) |
| `--asc` | Ascending sort (default: descending) |
| `--dry-run` | Simulate deletion without touching the filesystem — matches are found and reported as usual, but nothing is removed. Only matters once you're actually deleting (headless `--delete`, or confirming in the TUI); a plain preview never deletes regardless of this flag. |
| `--delete` | Actually delete matched artifacts. In a terminal, this switches to headless mode (see [Interactive TUI](/tui/#forcing-or-disabling-the-tui)) — pass `--tui --delete` for interactive deletion. |
| `-y, --yes` | Skip the headless confirmation prompt (only relevant with `--delete`) |
| `--json` | Machine-readable JSON output (forces headless mode) |
| `--format <table\|json\|jsonl>` | Output format for `scan` (default: `table` in a terminal, `json` when piped) |
| `--output <file>` | Where `plan` writes the plan (never overwrites an existing file) |
| `--tui` | Force the interactive TUI, even when stdout isn't a TTY. Overrides `--headless`/`--json`/`--delete`'s headless behavior. Local only — `--provider aws\|gcp` always runs headless. |
| `--headless` | Force non-interactive mode, even in a TTY |
| `--concurrency <n>` | Max concurrent filesystem operations (default: 8) |
| `--color` / `--no-color` | Force ANSI color on or off |
| `-h, --help` | Show help |
| `-V, --version` | Print version |

`--tui` and `--headless` cannot be combined, nor can `--color` and `--no-color`, nor `--config` and `--no-config` — purgeit exits with an error (code `2`) if you pass conflicting pairs. `--provider aws|gcp` similarly rejects every local-only flag above (`--full`, `--project`, `--depth`, `--targets`, `--min-size`, `--exclude`, `--no-gated`, `--tui`, and an explicit directory) — see [Cloud cleanup](/cloud/) for the full flag set that applies instead.

## Scanning several folders

Pass several directories to scan them together: each root is scanned in turn with its own config, and an artifact under overlapping roots (say `~/dev` and `~/dev/app`) is reported once. JSON output lists `roots` and gives every entry its `root`; the table shows `~/`-relative paths.

`--discover` adds the folders projects usually live in: `~/www`, `~/dev`, `~/Projects`, `~/GitHub`, `~/Code`, `~/Workspace`, `~/Repos`, `~/Development`, `~/Library/CloudStorage`, and the worktree folders AI coding agents use (`~/.claude/worktrees`, `~/.codex/worktrees`) — whichever exist — plus any other folder directly in your home directory that holds a project within two levels. It never scans `~/Library` (beyond CloudStorage), the Trash, `~/Applications`, or a stray `~/node_modules`.

```bash
purgeit scan --discover
purgeit scan ~/dev ~/work --min-age 30d
```

The TUI reviews one directory at a time; use `scan` for several or `--discover`.

## Safety checks

A rule matches by name (plus a sibling manifest for gated rules, or a marker file for tagged ones), but a name never proves that a directory is regenerable. purgeit therefore checks every match before offering it, and again before deleting it:

- **Authored content is protected.** A match containing its own `.git`, a `*-keypair.json` deploy key (within three levels — e.g. Anchor's `target/deploy/`), or any file tracked by git is reported as *protected* instead of offered: listed under `diagnostics` in JSON with a `reason`, noted on stderr, and never deleted. If git can't be asked (anything other than "not a repository"), the match is protected as `unverified`.
- **Your home folder's app data is skipped.** Scanning your home directory never descends into `~/Library` (including Xcode's global DerivedData), `~/.Trash` or `~/Applications` — clean those with a system cleaner.
- **Deletes stay inside the scanned roots.** Right before deleting, each path is resolved through symlinks and refused if it now points outside the roots you scanned.
- **Recently used artifacts are kept.** `--delete` and `apply` skip any artifact with something modified inside it in the last 7 days, and report it as a failure (exit code `1`). Pass `--min-age <duration>` to change the window, or `--min-age 0` to turn the check off. The TUI, where you pick each row yourself, has no window.
- **Cloud-synced folders are flagged.** Matches under `~/Library/CloudStorage` (Dropbox, Google Drive, OneDrive, ...) or iCloud Drive carry `cloudSynced: true` in JSON and a `[cloud]` prefix in the table: deleting there also deletes from every synced device.

## Deletion history

Every real deletion (and every failed or refused one) from `scan --delete`, `apply` or the TUI is appended to a JSON Lines history — dry runs are not. `purgeit history` prints it newest first; `--json` and `--limit <n>` are available.

| Platform | History file |
| --- | --- |
| macOS | `~/Library/Logs/purgeit/history.jsonl` |
| Windows | `%LOCALAPPDATA%\purgeit\history.jsonl` |
| Linux and others | `$XDG_STATE_HOME/purgeit/history.jsonl` (default `~/.local/state/purgeit/`) |

Set `PURGEIT_HISTORY_FILE` to use another file, or `PURGEIT_NO_HISTORY=1` to stop recording.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success — matches found and reported, or deletion completed with no failures |
| `1` | Nothing was found, or deletion had one or more failures |
| `2` | Usage error (bad flags) or environment error (e.g. invalid config file) |

## Examples

Preview the largest artifacts in a directory:

```bash
purgeit --headless --dry-run ~/dev
```

Delete all `node_modules` folders across a project tree that haven't been touched in a month:

```bash
purgeit --targets node_modules --min-age 30d --delete --yes ~/dev
```

Review everything reclaimable across your usual project folders:

```bash
purgeit scan --discover --min-size 100MB
```

Exclude a specific project from the scan:

```bash
purgeit --exclude 'legacy-project/*' ~/dev
```

Only clean artifacts above 10 MB:

```bash
purgeit --min-size 10MB --headless --dry-run ~/dev
```

Open the interactive TUI with deletion enabled, scanning only two levels deep:

```bash
purgeit --tui --delete --depth 2 ~/dev
```

Restrict a scan to a single project, ignoring gated rules:

```bash
purgeit --project my-app --no-gated ~/dev
```
