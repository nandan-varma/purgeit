---
title: Contributing
description: Set up the repo and add rules.
---

```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

Tests use real temporary directories (`test/tree.ts`); never scan or delete a shared directory in a test. Deletion tests need old fixtures: call `backdate(root)` or pass `minAge: 0`.

`src/tui/` is the only place that may import `react` or `ink`; CI enforces it.

## Add an ecosystem

1. Create `src/rules/catalog/<name>.ts` exporting `readonly RuleDefinition[]`.
2. Spread it into `RULE_CATALOG` in `catalog/index.ts`.
3. If it is a new category, add it to `RuleCategory`, `CATEGORY_LABELS` and `CATEGORY_ORDER` in `catalog/types.ts`.

Prefer `safe` only for names that are unambiguous everywhere. Anything generic (`build`, `out`, `bin`) must be `gated` on a manifest. The docs rule table renders from the catalog automatically.

## Config schema

`purgeit.schema.json` is generated from the zod schema: run `npm run schema` after changing `src/config/schema.ts` (a test fails if it is stale).

## Releasing

Bump `version`, commit, push `main`, then `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag triggers the release workflow.
