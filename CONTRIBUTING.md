# Contributing

```bash
bun install        # installs dependencies and git hooks
bun run check      # fmt, oxlint, typecheck, knip, tests + coverage, build, package checks
```

See <https://purgeit.nandan.fyi/contributing/> for adding rules and the test conventions. Short version:

- Tests use real temp directories (`test/tree.ts`). Never scan or delete a shared directory (`/tmp`, `$HOME`).
- Anything that deletes needs old fixtures: `backdate(root)` or `minAge: 0`.
- Only `src/tui/` may import `react` or `ink` (CI enforces it); `bun run doctor` must stay clean.
- After changing `src/config/schema.ts`, run `bun run generate`.
