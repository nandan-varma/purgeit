# Contributing

```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

See <https://purgeit.nandan.fyi/contributing/> for adding rules and the test conventions. Short version:

- Tests use real temp directories (`test/tree.ts`). Never scan or delete a shared directory (`/tmp`, `$HOME`).
- Anything that deletes needs old fixtures: `backdate(root)` or `minAge: 0`.
- Only `src/tui/` may import `react` or `ink` (CI enforces it).
- After changing `src/config/schema.ts`, run `npm run schema`.
