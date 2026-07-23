---
title: Contributing
description: Development workflow for purgeit contributors.
---

## Quick start

Clone the repository and install dependencies:

```bash
git clone https://github.com/nandan-varma/purgeit.git
cd purgeit
npm install
```

## Verify everything

Before opening a pull request, run the full verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Running tests

Run the full suite:

```bash
npm test
```

Run a single test file:

```bash
npx vitest run src/rules/merge.test.ts
```

Run a specific test by name:

```bash
npx vitest run -t "test name substring"
```

### Coverage

```bash
npm run coverage
```

Coverage is enforced at **100%** statements/branches/functions/lines for everything except `src/ui/**` and `src/types.ts`. `src/ui/` is exempt because Ink rendering/keybinding branches don't map cleanly onto a hard coverage bar — it's exercised via `ink-testing-library` behavior tests (`App.test.tsx`) instead. `npm run coverage` exits non-zero below the threshold, so run it before opening a PR that touches non-UI code.

## Working on the code

- Keep `src/ui/` as the only directory that imports React or Ink. The CI enforces this with a grep check.
- TypeScript is strict: `exactOptionalPropertyTypes` means an optional field fed by a `T | undefined` value must be declared `field?: T | undefined`, not just `field?: T`. `noUncheckedIndexedAccess` means array/index access produces `T | undefined` — use `as T` only when a value is genuinely guaranteed (e.g. a regex capture group after a successful match), not a defensive `??` that 100% branch coverage will then flag as unreachable.
- Lint rules `noUnusedImports`, `noUnusedVariables`, and `useExhaustiveDependencies` are errors (not just the Biome recommended preset). Suppress intentionally with `// biome-ignore lint/<rule>: <reason>` immediately above the offending line — for `useExhaustiveDependencies` that's the `useEffect(() => {` line itself, not the closing `}, [deps])`.
- Vitest is configured with `fileParallelism: false` because tests spawn real `du` child processes; parallel file execution can exhaust `posix_spawn` on macOS.
- Real filesystem fixtures, not mocks — `test/fixtures/build-tmp-tree.ts`'s `buildTree()`/`cleanupTree()` create/remove real temp directories. Don't mock `fs` for scanner/walk/rule tests.
- Do not add a `rootDir` to tsconfig; `test/fixtures/build-tmp-tree.ts` lives outside `src/`.
- Never add `#!/usr/bin/env node` to source files; tsup's `banner.js` adds the shebang during bundling — adding it in source too produces a duplicate that breaks execution.

## CI

GitHub Actions runs the full verification (typecheck, lint, test, build) across a 6-job matrix (ubuntu/macos/windows × Node 20/22), plus two purgeit-specific checks after build:

1. A grep check that fails if `react`/`ink` is imported anywhere outside `src/ui/`.
2. A headless smoke test that builds a real fixture tree and runs the built `dist/cli.js --json --dry-run` against it — the only place the actual built CLI output is exercised end-to-end, catching anything that passes unit tests but breaks in the bundled output.

## Publishing

Releases are tag-triggered, not published by hand:

1. Make sure the full verification passes, including coverage.
2. Bump the version (`npm version patch|minor|major --no-git-tag-version`), commit, and push to `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` — pushing the tag triggers `.github/workflows/release.yml`, which runs `npm publish --provenance --access public`.

## Documentation

Docs live in the `docs/` directory and are built with [Astro Starlight](https://starlight.astro.build/). To edit or preview them:

```bash
cd docs
npm install
npm run dev
```

When adding new CLI flags, config options, or exported APIs, please update the relevant docs page.
