---
title: Interactive TUI
description: Keyboard reference and workflow for purgeit's terminal UI.
---

Running `purgeit` in a terminal (with no `--json`, `--delete`, or `--headless` flag) opens an interactive table of every artifact it finds. This page documents the full workflow and keymap. Press <kbd>?</kbd> at any time inside the TUI to see the same reference on screen.

## Workflow

The TUI moves through a small number of phases, and only one path leads to deletion:

1. **Scanning** — a spinner shows while purgeit walks the directory tree. Matches stream into the table as they're discovered; each row's size fills in a moment later once it's computed, so you don't wait for the whole scan to start reviewing results.
2. **Ready** — the table is interactive. Nothing is selected. Navigate, sort, and toggle rows.
3. **Confirming** — reachable only by pressing <kbd>Enter</kbd> with at least one row selected. Shows exactly what will be deleted (up to 5 items, plus a count of the rest) and the total size. This is the only place deletion can be triggered.
4. **Deleting** — a progress view while selected artifacts are removed (or simulated, in `--dry-run`).
5. **Done** — a summary of what was deleted and what failed, if anything.

<kbd>q</kbd> or <kbd>Ctrl</kbd>+<kbd>C</kbd> quits without deleting anything from any phase except deleting itself — once a confirmed deletion is in progress, it's deliberately not interruptible mid-batch and runs to completion.

## Table columns

| Column | Meaning |
| --- | --- |
| SIZE | Real on-disk size (`du -s -k`, or a pure-Node walk on Windows). Blank until computed. |
| TYPE | `always-safe` or `gated` — see [built-in rules](/rules/). |
| NAME | The matched directory name (e.g. `node_modules`). |
| PROJECT | The top-level project the match was found under. Hidden on narrow terminals to give PATH more room. |
| PATH | Full path to the match. Truncates from the start so the meaningful tail (the artifact's own directory) stays visible. |

The header shows the scanned root, item count, running total size, current sort, and (once you've selected something) the selected count and size.

## Keybindings

### Navigation

| Key | Action |
| --- | --- |
| <kbd>↑</kbd> / <kbd>k</kbd> | Move cursor up |
| <kbd>↓</kbd> / <kbd>j</kbd> | Move cursor down |
| <kbd>Page Up</kbd> | Jump up one page |
| <kbd>Page Down</kbd> | Jump down one page |
| <kbd>Home</kbd> / <kbd>g</kbd> | Jump to the first row |
| <kbd>End</kbd> / <kbd>G</kbd> | Jump to the last row |

### Selection

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Toggle selection on the current row |
| <kbd>a</kbd> | Select all |
| <kbd>n</kbd> | Clear selection |
| <kbd>i</kbd> | Invert selection |

### Sorting

| Key | Action |
| --- | --- |
| <kbd>s</kbd> | Cycle sort key: size → path → name → size... |
| <kbd>r</kbd> | Reverse the current sort direction |

### Other

| Key | Action |
| --- | --- |
| <kbd>Enter</kbd> | Review and confirm deletion (only enabled once ≥1 row is selected) |
| <kbd>?</kbd> | Toggle the keybinding help overlay |
| <kbd>q</kbd> / <kbd>Ctrl</kbd>+<kbd>C</kbd> | Quit without deleting anything |

### While confirming

| Key | Action |
| --- | --- |
| <kbd>y</kbd> / <kbd>Y</kbd> | Confirm — start deleting |
| <kbd>n</kbd> / <kbd>N</kbd> / <kbd>Esc</kbd> | Cancel — back to the table, nothing deleted |

## Color legend

- **Cursor row** — a full-row highlight showing where keyboard navigation currently is.
- **Selected row** — a full-row highlight (a different color from the cursor) showing what's staged for deletion.
- **Gated bullet** — this match needs a sibling manifest to be considered safe (see [built-in rules](/rules/)).
- **Safe bullet** — this match is always safe to delete, wherever it's found.

## Safety model

The TUI is deliberately hard to use destructively by accident:

- Nothing is selected when the table first appears — you always start from zero.
- Deletion is only reachable through the confirming phase, which requires an explicit <kbd>Enter</kbd> with something selected, and then an explicit <kbd>y</kbd>.
- The confirm dialog always shows what's about to be deleted and its total size before you commit.
- `--dry-run` simulates the entire deleting phase — the UI behaves identically, but nothing on disk is touched. Useful for getting comfortable with a new scan root before trusting it.
- Quitting (<kbd>q</kbd> / <kbd>Ctrl</kbd>+<kbd>C</kbd>) works from every phase up through confirming, including mid-scan, and never deletes anything — but it can't interrupt a deletion that's already been confirmed and started.

## Forcing or disabling the TUI

- `--tui` forces the interactive TUI even when stdout isn't a TTY (e.g. piped output), and overrides everything below.
- `--headless`, `--json`, and `--delete` **each independently** force non-interactive mode, even inside a real terminal. This means `purgeit --delete ~/dev` in a terminal does *not* open the TUI — it runs headless and prompts for confirmation on stdin unless `--yes` is also given. Add `--tui` if you want the interactive table with deletion enabled.
- With none of the above, purgeit opens the TUI automatically whenever stdout is a TTY, and falls back to a headless preview otherwise (e.g. when piped).

See the [CLI reference](/cli/) for headless/scripting usage.
