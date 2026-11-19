---
title: CLI reference
description: Every command and flag.
---

```text
purgeit [dirs…]            browse and select in the interactive UI (default)
purgeit scan [dirs…]       list artifacts, delete nothing
purgeit clean [dirs…]      delete artifacts
purgeit rules              list the rules in effect
purgeit history            show what has been deleted
purgeit skill              print the guide for AI agents
```

## Options shared by browse, scan and clean

| Flag | Meaning |
| --- | --- |
| `--discover` | also scan the folders where this machine keeps projects |
| `-x, --exclude <glob>` | skip matching directories (repeatable). A bare name matches at any depth |
| `--only <rules>` | only these rules or [groups](/configuration/) (repeatable, comma-separated). Unknown names are an error |
| `--safe-only` | skip rules that need a manifest as proof |
| `--min-size <size>` | ignore artifacts smaller than this (`50MB`) |
| `--min-age <duration>` | ignore artifacts changed more recently than this (`7d`, `36h`) |
| `--depth <n>` | never descend deeper than this |
| `--include-empty` | keep artifacts that contain no files |
| `--config <file>` / `--no-config` | use a specific config file / ignore config |

Flags beat the config file. Sizes use binary units (1 KB = 1024 bytes); durations accept `m`, `h`, `d`, `w`.

## scan

`--format text` (default) prints a table. `--format json` prints one report (`version`, `roots`, `entries`, `summary`). `--format ndjson` streams `entry` events and a final `done`.

Each entry has `path`, `rule`, `kind`, `categories`, `evidence`, `bytes`, `files`, `lastActive` (epoch ms) and `protection` (`null` when deletable).

## clean

| Flag | Meaning |
| --- | --- |
| `-y, --yes` | don't ask for confirmation |
| `-n, --dry-run` | run every check, delete nothing |
| `--plan <file>` | delete exactly the entries of a reviewed `scan --format json` report |
| `--format json` | machine-readable result (requires `--yes` or `--dry-run`) |

`--min-age` defaults to `7d` for `clean` and doubles as a guard: anything with a change inside that window is skipped at deletion time, whatever the scan said. Without a terminal and without `--yes`, `clean` refuses to delete.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | some paths were skipped or failed, or you declined the confirmation |
| 2 | bad arguments, config or plan |
| 130 | interrupted |
| 70 | internal error |

## rules, history

`purgeit rules [--category rust] [--format json]` lists what is matched and what proof gated rules need, including your config. `purgeit history [-n 20] [--format json]` shows deletions, newest first, from `~/Library/Logs/purgeit/history.jsonl` (macOS) or the platform's log directory.
