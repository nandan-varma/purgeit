# purgeit

Find and safely delete regenerable dev build artifacts — `node_modules`, `target`, `dist`, `Pods`, `.next`, `.build` and 60 more — across all your projects.

```bash
npx purgeit ~/dev          # browse, select, delete (interactive)
npx purgeit scan ~/dev     # just list
npx purgeit clean ~/dev    # delete, with confirmation
```

- **Safe.** Nothing is selected by default. Every path is re-verified at the moment of deletion: a rule must still claim it, it must resolve inside the scanned folders, hold no git-tracked files, nested repositories or deploy keys, and be untouched for `--min-age` (7 days for `clean`).
- **Fast.** One traversal measures size, file count and last activity. Hardlinked files (pnpm) only count when deleting them really frees space.
- **Honest.** Sizes are space that would be freed. Unreadable directories and filtered results are counted, never hidden.
- **Scriptable.** `scan --format json` gives a report you can review and hand back to `clean --plan`. Stable exit codes.
- **Extensible.** Rules are data. Add your own in a typed config (`purgeit.config.ts`) validated by a JSON Schema.
- **A library.** `scan()` and `clean()` are plain async iterators.

Requires Node.js 22+. macOS, Linux and Windows.

## Use

```bash
purgeit [dirs…]            # interactive UI
purgeit scan  [dirs…]      # --format text|json|ndjson
purgeit clean [dirs…]      # --yes  --dry-run  --plan plan.json
purgeit rules              # what is matched, and the proof each rule needs
purgeit history            # what has been deleted
```

Shared flags: `--discover`, `--exclude <glob>`, `--only <rules>`, `--safe-only`, `--min-size 50MB`, `--min-age 7d`, `--depth <n>`, `--include-empty`, `--config <file>`, `--no-config`.

```bash
purgeit scan ~/dev --min-size 100MB
purgeit clean ~/dev --only node_modules,target --min-age 30d --dry-run
purgeit scan ~/dev --format json > plan.json   # trim it, then:
purgeit clean --plan plan.json --yes
```

## Configure

```ts
// purgeit.config.ts
import { defineConfig } from 'purgeit';

export default defineConfig({
  safe: ['.my-cache'],
  gated: [{ name: 'out', when: { file: 'project.toml' } }],
  exclude: ['legacy/**'],
  minAge: '14d',
});
```

## Library

```ts
import { clean, createRuleSet, scanAll } from 'purgeit';

const rules = createRuleSet();
const { entries } = await scanAll(['/Users/me/dev'], { rules });
```

Documentation: <https://purgeit.nandan.fyi>

## Develop

```bash
bun install && bun run check
```

MIT
