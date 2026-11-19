---
title: Contributing
description: Set up the repo, run the checks, and add rules.
---

```bash
bun install      # dependencies and git hooks
bun run check    # format, oxlint, typecheck, knip, tests + coverage, build, package checks
```

Node.js 22+ and [Bun](https://bun.sh) are needed. `bun run check` is the same gate CI and releases run, and takes seconds.

## Conventions

- Tests use real temporary directories (`test/tree.ts`). Never scan or delete a shared directory (`/tmp`, `$HOME`). Anything that deletes needs old fixtures: `backdate(root)` or `minAge: 0`.
- Assert paths with `rel()`, never literal `/`, and don't hard-code sizes: allocated sizes depend on the filesystem.
- Only `src/tui/` may import `react` or `ink` (oxlint enforces it); `bun run doctor` must stay clean.
- Deletion goes through `clean()` → `inspect()` only. Never weaken a guard to make a test pass.

## Add an ecosystem

1. Create `src/rules/catalog/<name>.ts` exporting `readonly RuleDefinition[]`.
2. Spread it into `RULE_CATALOG` in `catalog/index.ts`.
3. If it is a new category, add it to `RuleCategory`, `CATEGORY_LABELS` and `CATEGORY_ORDER` in `catalog/types.ts`.

Use `safe` only for names that are unambiguous everywhere. Anything generic (`build`, `out`, `bin`) must be `gated` on a manifest. The [rules reference](/reference/rules/) renders from the catalog automatically. Files in `catalog/` must not import runtime dependencies — the docs site builds from them (a test enforces it).

## Generated files

`purgeit.schema.json` and `docs/src/generated/cli.json` are generated: run `bun run generate` after changing `src/config/schema.ts` or the CLI's options (tests fail if they are stale).

## Releasing

Bump `version`, commit, push `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag runs the full `check` gate and publishes to npm with trusted publishing and provenance — no tokens involved.
