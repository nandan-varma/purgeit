---
title: CLI reference
description: Command-line options for purgeit.
---

## Usage

```bash
purgeit [directory] [options]
```

If no directory is given, the current working directory is used. Pass it either as a positional argument or via `-d`/`--directory`, not both.

## Options

| Flag | Description |
| --- | --- |
| `-d, --directory <path>` | Root directory to scan (default: cwd) |
| `--full` | Flat scan mode: treat the root as one scan unit instead of grouping immediate children as separate projects |
| `--project <name>` | Limit to a single top-level project by name (projects mode only) |
| `--exclude <glob>` | Exclude paths matching the glob, relative to the scanned root (repeatable) |
| `--targets <names>` | Comma-separated rule names or a named target group to restrict matching to |
| `--min-size <size>` | Skip matches below this size (e.g. `10MB`, `500KB`) |
| `--min-age <duration>` | Skip matches newer than this age (e.g. `7d`, `24h`) — applies to local mtime and, for cloud resources, `createdAt` |
| `--max-age <duration>` | Skip matches older than this age (e.g. `30d`) |
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
| `--tui` | Force the interactive TUI, even when stdout isn't a TTY. Overrides `--headless`/`--json`/`--delete`'s headless behavior. Local only — `--provider aws\|gcp` always runs headless. |
| `--headless` | Force non-interactive mode, even in a TTY |
| `--concurrency <n>` | Max concurrent filesystem operations (default: 8) |
| `--color` / `--no-color` | Force ANSI color on or off |
| `-h, --help` | Show help |
| `-V, --version` | Print version |

`--tui` and `--headless` cannot be combined, nor can `--color` and `--no-color`, nor `--config` and `--no-config` — purgeit exits with an error (code `2`) if you pass conflicting pairs. `--provider aws|gcp` similarly rejects every local-only flag above (`--full`, `--project`, `--depth`, `--targets`, `--min-size`, `--exclude`, `--no-gated`, `--tui`, and an explicit directory) — see [Cloud cleanup](/cloud/) for the full flag set that applies instead.

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

Delete all `node_modules` folders across a project tree:

```bash
purgeit --targets node_modules --delete --yes ~/dev
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
