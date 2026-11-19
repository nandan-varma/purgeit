---
title: Safety model
description: What purgeit checks before it deletes anything, and how a scan works.
---

purgeit assumes every scan result is stale by the time you act on it, and that a name never proves a directory is regenerable.

## At scan time

1. **Rules** decide what is a candidate: safe names, names proved by a manifest, and tagged caches.
2. **Measure** — one traversal per candidate gives allocated size, file count and the newest modification inside. Symlinks are never followed. A hardlinked file counts only if every link lives inside the tree, because only then does deleting it free space (this keeps pnpm's store from inflating the numbers).
3. **Protection** marks a candidate as protected when it contains its own `.git`, a `*-keypair.json` within three levels (Anchor deploy keys), or any file git tracks. If git cannot answer, it is *unverified* and also protected.

Protected candidates are listed with the reason and can never be selected.

## At deletion time

Everything is re-derived from the filesystem as it is now. A path is refused, with a reason, unless:

1. it is not a filesystem root or your home directory;
2. it still exists and resolves strictly **inside a scanned root** (defeats a symlink swapped in after the scan);
3. it is still a real directory that **a rule still claims**;
4. protection checks still pass;
5. nothing inside changed within `--min-age` (7 days for `clean`);
6. when it came from a scan or plan, nothing inside changed **after** that scan.

Anything that cannot be verified is refused. One refusal never stops the rest.

## Records

Deletions and failures are appended to `history.jsonl` (see `purgeit history`). Dry runs write nothing.

## Layout

```text
rules/   catalog (data), conditions, compiled RuleSet, matching
fs/      one traversal: measure · activity · protection
scan/    scan() → events, discoverRoots()
clean/   inspect() guards, clean() → events, history
config/  zod schema, loader
cli/     commands (pure `run(argv, env)`)
tui/     React + Ink — the only code allowed to import them
```
