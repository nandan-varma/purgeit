---
title: Getting started
description: Install purgeit and clean your first project folder.
---

purgeit needs Node.js 22 or newer.

```bash
npx purgeit            # scan the current directory in the interactive UI
npx purgeit ~/dev      # or any directories
npm install -g purgeit # optional
```

## Three ways to use it

| You want to… | Run |
| --- | --- |
| Browse, select and delete | `purgeit [dirs…]` |
| See what's there, change nothing | `purgeit scan [dirs…]` |
| Delete without a UI | `purgeit clean [dirs…]` |

`purgeit` with no directory scans the current one. `--discover` also scans the places this machine keeps projects (`~/dev`, `~/Projects`, `~/Code`, AI agent worktrees, and any home folder that holds projects).

## A first run

```bash
purgeit scan ~/dev --min-size 100MB
```

```text
    SIZE  AGE  RULE          PATH
  6.5 GB  6h   target        ~/dev/apps/mail/target
  1.6 GB  2d   build         ~/dev/tools/ipa-forge/build
979.6 MB  1d   node_modules  ~/dev/personal/mocha/node_modules

3 artifacts · 9.1 GB reclaimable — scanned 1 root in 2.1s
```

AGE is how long since anything inside last changed. Then clean up:

```bash
purgeit clean ~/dev --min-size 100MB --dry-run   # run every check, delete nothing
purgeit clean ~/dev --min-size 100MB             # asks first
```

`clean` leaves anything modified in the last 7 days alone (`--min-age 0` turns that off). See [the safety model](/architecture/) for everything it checks.
