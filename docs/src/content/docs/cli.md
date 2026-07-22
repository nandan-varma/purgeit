---
title: CLI reference
description: Command-line options for purgeit.
---

## Usage

```bash
purgeit [directory] [options]
```

If no directory is given, the current working directory is used.

## Options

| Flag | Description |
| --- | --- |
| `-d, --directory <path>` | Root directory to scan (default: cwd) |
| `--full` | Flat scan mode: treat the root as one scan unit |
| `--project <name>` | Limit to a single top-level project (projects mode only) |
| `--exclude <glob>` | Exclude paths matching the glob (repeatable) |
| `--targets <names>` | Comma-separated rule names or target groups to restrict matching |
| `--min-size <size>` | Skip matches below this size (e.g. `10MB`, `500KB`) |
| `--depth <n>` | Max recursion depth |
| `--config <path>` | Explicit config file path |
| `--no-config` | Ignore any discovered config file (use defaults only) |
| `--no-gated` | Disable gated rules (always-safe only) |
| `--sort <size\|path\|name>` | Sort key for list/JSON output (default: `size`) |
| `--asc` | Ascending sort (default: descending) |
| `--dry-run` | Simulate deletion without touching files. In headless mode this is the default unless `--delete` is given; in a TTY the TUI still opens and confirmed deletions are simulated. |
| `--delete` | Actually delete matched artifacts |
| `-y, --yes` | Skip the confirmation prompt (headless `--delete` only) |
| `--json` | Machine-readable JSON output (disables the TUI) |
| `--tui` | Force the interactive TUI |
| `--headless` | Force non-interactive mode |
| `--concurrency <n>` | Max concurrent filesystem operations (default: 8) |
| `--color` / `--no-color` | Force ANSI color on or off |
| `-h, --help` | Show help |
| `-V, --version` | Print version |

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
