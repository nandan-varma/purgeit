---
title: FAQ & troubleshooting
description: Common questions and how to fix common surprises.
---

## Is anything deleted without asking?

No. The UI needs an explicit selection plus `y`; `clean` asks unless you pass `--yes`; without a terminal it refuses to delete unless you pass `--yes`.

## Why was an artifact skipped?

`clean` and the UI print the reason: modified within `--min-age`, changed after the scan, protected (nested repo, deploy keypair, git-tracked files), or no longer claimed by a rule. See the [list of reasons](/guides/clean-safely/#when-something-is-skipped).

## Why is the size smaller than `du`?

purgeit reports space that deleting would actually free. Files hardlinked to something outside the artifact (pnpm's content store) aren't counted. See [How sizes are counted](/concepts/how-it-works/#how-sizes-are-counted).

## Why didn't it find my `build` folder?

`build` is only matched beside a manifest (`package.json`, `Cargo.toml`, …). Run `purgeit rules` to see the proof each gated rule needs, or [add your own rule](/guides/custom-rules/).

## "N directories could not be read"

Permission errors and directories that vanish mid-scan are skipped and counted, never hidden.

## The UI says it needs a terminal

You are in a pipe, a CI job or a script. Use [`scan` and `clean`](/reference/cli/).

## `purgeit … | head` behaviour

Closing the pipe early stops purgeit quietly with exit code 0.

## Can I undo a deletion?

No — artifacts are regenerable, which is why the rules are strict. `purgeit history` lists what was removed.

## Windows and macOS specifics

Both are supported. Space is measured from allocated blocks on every platform; `git` is needed only for the tracked-files check.

## Does it phone home?

No. There is no telemetry and no network access.

## It deleted something it shouldn't have

Please [open an issue](https://github.com/nandan-varma/purgeit/issues) with `purgeit history --format json` and the rule that matched. Safety bugs are treated as top priority.
