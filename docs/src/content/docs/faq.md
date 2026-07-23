---
title: FAQ & troubleshooting
description: Common questions, edge cases, and how to recover from unexpected behavior.
---

## Why is nothing selected by default?

`purgeit` is designed to be safe. The TUI opens with every match unselected so you can review sizes and paths before deleting anything. Select rows with <kbd>Space</kbd>, then press <kbd>Enter</kbd> to review and confirm. See the [Interactive TUI reference](/tui/) for the full keymap.

## I ran `purgeit` and nothing was found

Common causes:

- The directory is already clean.
- You are scanning a directory that does not contain projects in its immediate children (use `--full` for flat mode).
- The artifacts are below `--min-size`.
- The artifacts are matched by gated rules but the sibling manifest is missing. See the [built-in rules reference](/rules/).

Exit code `1` means nothing was found or deletion had failures.

## How do I see a preview without deleting anything?

Headless mode with `--dry-run` is the safest way to preview:

```bash
purgeit --headless --dry-run ~/dev
```

For machine-readable output, add `--json`:

```bash
purgeit --json --dry-run ~/dev
```

In a TTY, `--dry-run` still opens the TUI, but confirmed deletions are simulated.

## Can I use this in CI or a cron job?

Yes. Use `--headless --delete --yes` to delete non-interactively:

```bash
purgeit --headless --delete --yes --targets node_modules ~/dev
```

Be cautious with `--yes` — it skips the confirmation prompt entirely.

## Why does `purgeit` use `du` on macOS/Linux?

`du -s -k` is fast and matches the behavior of the original `CLEANUP.sh`. On Windows, where `du` is unavailable, purgeit falls back to a pure-Node.js recursive `stat` walk.

## How do I exclude a project or path?

Use `--exclude <glob>` (repeatable). The glob is matched against the path relative to the scanned root:

```bash
purgeit --exclude 'legacy/*' --exclude '*.log' ~/dev
```

## How do I target only `node_modules`?

```bash
purgeit --targets node_modules
```

You can also use target groups defined in a config file:

```bash
purgeit --targets frontend
```

## `Pods` or `build` are not showing up

These are [gated rules](/rules/#always-safe-vs-gated). They only appear when a sibling manifest file exists in the same directory. For example, `Pods/` is reported only next to a `Podfile`, and `build/` is reported next to a `package.json`, `pyproject.toml`, `CMakeLists.txt`, or several other manifests — expand the relevant section on the [built-in rules page](/rules/) to see every condition.

To disable gated rules entirely, use `--no-gated`.

## Can I customize which directories are cleaned?

Yes. Create a `purgeit.config.ts` in the root you are scanning. See the [configuration guide](/configuration/) for examples.

## Why does the TUI show sizes as `—` for some rows?

Sizes are computed asynchronously after a match is found. Very large directories or directories with permission issues may take a moment to size. If sizing fails, the entry remains visible with an unknown size.

## How do I abort a long scan?

Press <kbd>Ctrl</kbd>+<kbd>C</kbd> in the TUI. In headless mode, send `SIGINT` or provide an `AbortSignal` to the programmatic API.

## Does `purgeit` delete files outside the scanned root?

No. Matches are always directories found under the scanned root. The delete engine also refuses to delete the filesystem root or your home directory as a last-line-of-defense guard.

## Where can I report a bug or request a feature?

Open an issue on [GitHub](https://github.com/nandan-varma/purgeit/issues).
