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

## Working on the code

- Keep `src/ui/` as the only directory that imports React or Ink. The CI enforces this with a grep check.
- TypeScript options are strict: `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are enabled.
- Vitest is configured with `fileParallelism: false` because tests spawn real `du` child processes; parallel file execution can exhaust `posix_spawn` on macOS.
- Do not add a `rootDir` to tsconfig; `test/fixtures/build-tmp-tree.ts` lives outside `src/`.
- Never add `#!/usr/bin/env node` to source files; tsup's `banner.js` adds the shebang during bundling.

## Publishing

1. Make sure the full verification passes.
2. Use `npm version` to bump the version.
3. Push tags; `npm publish` will be handled by the CI workflow.

## Documentation

Docs live in the `docs/` directory and are built with [Astro Starlight](https://starlight.astro.build/). To edit or preview them:

```bash
cd docs
npm install
npm run dev
```

When adding new CLI flags, config options, or exported APIs, please update the relevant docs page.
