---
name: purgeit
description: Find and safely delete regenerable dev build artifacts (node_modules, dist, target, Pods, ...) across a directory of projects, via purgeit's CLI or library API.
---

# purgeit

`purgeit` finds regenerable build artifacts — `node_modules`, `dist`, `target`, `Pods`, and
similar — across a directory of projects, and deletes only the ones a human (or an agent acting
on their behalf) explicitly selects. Safety is the entire point of the tool: matching is
restricted to either unconditionally-safe directory names or names gated behind proof of a
sibling manifest (e.g. `Pods` only matches next to a `Podfile`), and nothing is ever deleted
without an explicit selection step — there is no "clean everything" mode.

## Golden rule for agents

**Always list before you delete, and never pass `--delete` without either `--dry-run` first or
explicit user confirmation for the exact paths involved.** purgeit's own headless mode already
enforces a confirmation prompt unless `--yes` is passed — do not add `--yes` on an agent's own
initiative. Treat `--yes` as equivalent to skipping a safety check a human would otherwise see.

## CLI usage (no install required)

```bash
npx purgeit <directory> --json --dry-run          # list matches as JSON, delete nothing
npx purgeit <directory> --json --dry-run --min-size 100MB   # only artifacts >= 100MB
npx purgeit <directory> --json --dry-run --min-age 30d      # only untouched for 30+ days
npx purgeit <directory> --delete --yes            # actually delete — only after reviewing the list above
```

- `--json` gives machine-readable output: `{ root, totalBytes, entries: [{ path, project, kind,
  ruleName, size, lastModified }], warnings }`. `size` is bytes, `lastModified` is epoch ms (or
  `null` if not yet resolved).
- `--dry-run` simulates deletion without touching the filesystem — always do this before a real
  `--delete` run, and show the resulting entry list to the user for confirmation first.
- `kind: "gated"` entries (e.g. `Pods`, `build`) required an extra manifest-based check to match;
  `kind: "always-safe"` entries (e.g. `node_modules`, `dist`) are unconditionally regenerable by
  name alone.
- `--min-size <size>` / `--min-age <duration>` / `--max-age <duration>` (e.g. `10MB`, `7d`, `24h`)
  narrow the result set — prefer narrowing over deleting everything found.
- Full flag reference: `npx purgeit --help`.

## Library usage (Node/TypeScript)

```ts
import { scan, defaultRuleSet, deleteEntries } from 'purgeit';

const ruleSet = defaultRuleSet();
const entries = [];
for await (const event of scan('/path/to/projects', ruleSet, { mode: 'projects' })) {
  if (event.type === 'found') entries.push(event.entry);
}
// Show `entries` to the user / reasoning step before ever calling deleteEntries.

for await (const event of deleteEntries(
  entries.map((e) => e.path),
  { dryRun: true }, // flip to false only after explicit confirmation of this exact list
)) {
  // event.type: 'deleting' | 'deleted' | 'error' | 'done'
}
```

- `scan()` is an async generator: `found` fires as soon as a match is discovered (`size`/
  `lastModified` start `null`), followed by independent `size`/`lastModified` events once resolved
  — don't assume they're populated at `found` time.
- `loadConfig()` resolves a user's `purgeit.config.*`/`.purgeitrc` if present; pass its result into
  `mergeRuleSets(defaultRuleSet(), loaded.config)` before scanning if you want to honor project-
  specific rules instead of only the built-in defaults.
- `deleteEntries()` never throws for an individual bad path — it aggregates failures into the
  final `done` event (`{ deleted, failed }`) instead of aborting the whole batch.

## What NOT to do

- Don't invent new "always-safe" names — only names in `RULE_CATALOG` (exported from the package)
  or a user's own config are matched. If a directory isn't matched, it isn't purgeit's job to
  delete it.
- Don't skip the dry-run/list step "to save time" — the entire safety model depends on a human
  seeing what will be deleted before it happens.
- Don't pass `--yes`/skip confirmation unless the user has already reviewed the specific dry-run
  output for this invocation.
