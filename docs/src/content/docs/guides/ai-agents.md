---
title: Using purgeit with AI agents
description: How agents (and the people supervising them) can use purgeit safely.
sidebar:
  order: 5
---

import { Aside } from '@astrojs/starlight/components';

purgeit is designed to be driven by an agent: every command has structured output, deletions are re-verified, and guidance ships with the CLI.

## Get the guide

```bash
purgeit skill
```

Prints a guide **versioned with the installed CLI**, so it always matches the commands that exist. The package also ships a `SKILL.md` stub for agent-skill installers, and this site serves [`/llms.txt`](/llms.txt) and [`/llms-full.txt`](/llms-full.txt).

## The workflow an agent should follow

1. **Look first.** `purgeit scan <dirs> --format json` lists candidates and deletes nothing. Narrow with `--min-size`, `--min-age`, `--only`.
2. **Show the user** the entries and the total. Entries with a non-null `protection` are never deleted.
3. **Delete only what was approved.** Trim the report to the approved entries and run `purgeit clean --plan plan.json --yes`. Use `--dry-run` to preview.

<Aside type="caution">
Don't lower `--min-age` below its default (`7d`) unless the user asks. It is the guard against deleting something a person is working on.
</Aside>

## Why this is safe to hand to an agent

- Every path is **re-verified at deletion time** against the rules, git, deploy keys and recent activity, so a stale or edited plan cannot delete the wrong thing. See the [safety model](/concepts/safety-model/).
- Nothing is deleted without `--yes` (or an interactive confirmation), and without a terminal `clean` refuses to guess.
- Output is stable JSON with documented [exit codes](/guides/automation/#exit-codes) and [formats](/reference/output-formats/).
- Everything deleted is recorded: `purgeit history --format json`.

## Other useful commands

| Command | Use |
| --- | --- |
| `purgeit rules --format json` | What is matched, and the proof gated rules need |
| `purgeit history --format json` | What has been deleted |
| `purgeit scan --format ndjson` | Stream results as they are measured |
