# Contributing to purgeit

## Prerequisites

- Node.js ≥ 20
- npm

## Development workflow

```bash
npm install
npm test              # run all tests
npm run coverage      # check 100% coverage (src/ui/ excluded)
npm run typecheck     # TypeScript strict check
npm run lint:fix      # auto-fix lint issues
npm run build         # build dist/
```

### Testing

Tests use vitest with real filesystem fixtures (`test/fixtures/build-tmp-tree.ts`). No mocking of `fs` — tests create real temp directories and clean them up after.

The TUI (`src/ui/`) is tested via `ink-testing-library` and is excluded from the 100% coverage threshold. Still write thorough tests, but don't chase branch coverage on rendering logic.

### CI isolation rule

`grep -rn "from 'react'\|from 'ink'" src/` outside `src/ui/` must be empty. This keeps the rule engine, scanner, and config layer framework-agnostic and testable with plain vitest.

## Publishing

### Pre-publish checklist

1. Verify `NPM_TOKEN` secret exists: `gh secret list --repo nandan-varma/purgeit`
2. If not set, use manual publish: `npm login` then `npm publish --provenance --access public`
3. Tag the release: `git tag v1.x.x && git push --tags`
4. The release workflow handles `npm publish` automatically on tag push.

### Known pitfall

The release workflow will fail with `ENEEDAUTH` if the `NPM_TOKEN` repo secret was never set on GitHub. Always verify before the first tag push.

## TUI verification

The TUI is verified via `ink-testing-library` unit tests in CI. Manual smoke testing in a real terminal is recommended before releases — the CI headless smoke test does not exercise the interactive UI.
