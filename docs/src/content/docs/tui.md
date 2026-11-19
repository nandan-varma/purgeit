---
title: Interactive UI
description: The full-screen terminal UI and its keys.
---

`purgeit [dirs…]` opens a full-screen UI in an interactive terminal. It uses the alternate screen, so your scrollback is untouched when you leave. Rows appear as they are measured; the header shows progress and the running totals.

```text
purgeit ~/dev                                          scanned in 2.1s
12.3 GB reclaimable  ·  2 selected (7.0 GB)
          SIZE↓  AGE    RULE              PATH
▸ [x]    6.5 GB  6h     target            ~/dev/apps/mail/target
  [ ]    1.6 GB  2d     build             ~/dev/tools/ipa-forge/build
  [x]  979.6 MB  1d     node_modules      ~/dev/personal/mocha/node_modules
   ⊘       4 KB  22mo   dist              ~/dev/tracked/dist
```

AGE is coloured by how recently the artifact changed (red under a week, yellow under a month, green beyond). `⊘` marks a protected artifact: it is shown with the reason but can never be selected. The two lines under the list say what the rule is and what proved it.

## Keys

| Key | Action |
| --- | --- |
| `↑` `↓` / `k` `j` | move |
| `PgUp` `PgDn`, `g` `G` | page, top, bottom |
| `space` | select / unselect |
| `a` `n` `i` | select all shown / none / invert |
| `/` | filter by path or rule (live); `esc` clears |
| `s` `r` | cycle sort (size, age, path) / reverse |
| `enter` | review the selection |
| `y` | delete (in the review) |
| `esc` | cancel the review |
| `b` | back to the list after deleting |
| `q` | quit |

Deleting is two deliberate steps: `enter` opens a review showing the count and total, and only `y` deletes. Each path is re-verified first; anything refused is listed afterwards with the reason.

The UI needs a terminal. Without one, `purgeit` explains that and exits with code 2; use `scan` and `clean`.
