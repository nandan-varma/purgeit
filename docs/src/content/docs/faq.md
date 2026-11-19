---
title: FAQ & troubleshooting
description: Common questions.
---

## Is anything deleted without asking?

No. The UI needs an explicit selection plus `y`; `clean` asks unless you pass `--yes`; without a terminal it refuses to delete unless you pass `--yes`.

## Why was an artifact skipped?

`clean` and the UI print the reason: modified within `--min-age`, changed after the scan, protected (nested repo, deploy keypair, git-tracked files), or no longer claimed by a rule.

## Why is the size smaller than `du`?

purgeit reports space that deleting would actually free. Files hardlinked to something outside the artifact (pnpm's content store) are not counted.

## Why didn't it find my `build` folder?

`build` is only matched beside a manifest (`package.json`, `Cargo.toml`, …). Run `purgeit rules` to see the proof each gated rule needs, or add your own rule in [the config](/configuration/).

## "N directories could not be read"

Permission errors and directories that vanish mid-scan are skipped and counted, never hidden.

## Can I undo a deletion?

No; artifacts are regenerable, which is why the rules are strict. `purgeit history` lists what was removed.

## Windows

Supported. Space is measured from allocated blocks and no external tools are needed except `git` for the tracked-files check.
