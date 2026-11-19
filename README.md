# purgeit

Reclaim disk space from every project — safely. purgeit finds `node_modules`, `target`, `dist`, `Pods`, `.next`, `.build` and 60 more kinds of regenerable build output, **groups them by project**, leads with the projects you've abandoned, and deletes only what it can prove is safe.

```bash
npx purgeit ~/dev          # browse projects, select, delete (interactive)
npx purgeit scan ~/dev     # list per project, change nothing
npx purgeit clean ~/dev --stale   # delete everything in projects dormant for 30+ days
```

```text
PROJECT                    SIZE  ITEMS  ACTIVE  ECOSYSTEMS
old-api                 1.3 GB      2     4mo  JS/TS
mail                    6.9 GB      1      5m  Rust
pushstack (+1 worktree)   2 GB      5      2m  JS/TS

8 projects · 14.8 GB reclaimable — scanned 1 root in 2.1s
3.1 GB of that is in 2 dormant projects — `purgeit clean --stale` targets them.
```

- **Projects, not folders.** One row per project (a monorepo is one; git worktrees fold into their repository), sorted dormant-first. `R` in the UI selects everything in dormant projects.
- **Safe by construction.** Nothing is preselected. Every path is re-verified at the moment of deletion: a rule must still claim it, it must resolve inside the scanned folders, hold no git-tracked files, nested repositories or deploy keys, and be untouched for `--min-age` (7 days for `clean`). Generic names (`target`, `out`, `coverage`, `venv`) are only trusted with proof.
- **Fast and honest.** One traversal measures size, files and activity; hardlinked files (pnpm) count only when deleting really frees space.
- **Explainable.** `purgeit explain <path>` says why a directory is matched, skipped or protected — using the same checks `clean` runs.
- **Scriptable.** `scan --format json` is a reviewable plan for `clean --plan`; errors are JSON too; stable exit codes.
- **For AI agents.** `purgeit skill` prints a guide versioned with the CLI, and every docs page is available as Markdown.
- **Extensible.** Rules are data: add your own in a typed config (`purgeit init`) validated by a JSON Schema.
- **A library, too.** `scan()` and `clean()` are plain async iterators.

macOS, Linux and Windows. Via npm it needs Node.js 22+; [standalone binaries](https://github.com/nandan-varma/purgeit/releases) need nothing.

## Use

```bash
purgeit [dirs…]            # interactive UI
purgeit scan  [dirs…]      # --by project|artifact  --format text|json|ndjson
purgeit clean [dirs…]      # --stale  --yes  --dry-run  --plan plan.json
purgeit explain <path>     # why matched / skipped / protected
purgeit rules              # what is matched, and the proof each rule needs
purgeit history            # what has been deleted
purgeit init               # starter config
purgeit completion zsh     # shell completions (bash, zsh, fish)
```

Shared flags: `--discover`, `--stale`, `--exclude <glob>`, `--only <rules>`, `--safe-only`, `--min-size 50MB`, `--min-age 7d`, `--depth <n>`, `--include-empty`, `--config <file>`, `--no-config`.

## Configure

```ts
// purgeit.config.ts — the nearest one, searching upward (or ~/.config/purgeit/config.ts)
import { defineConfig } from 'purgeit';

export default defineConfig({
  dormantAfter: '14d',
  safe: ['.my-cache'],
  gated: [{ name: 'out', when: { file: 'project.toml' } }],
  exclude: ['legacy/**'],
});
```

## Library

```ts
import { createRuleSet, groupProjects, scanAll } from 'purgeit';

const rules = createRuleSet();
const { entries } = await scanAll(['/Users/me/dev'], { rules });
const projects = groupProjects(entries);
```

Documentation: <https://purgeit.nandan.fyi>

## Develop

```bash
bun install && bun run check
```

MIT
