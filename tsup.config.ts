import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // Library entry (`@nandan-varma/purgeit`'s "." export): the
    // framework-agnostic scanner/rule-engine/config API. Never touches
    // react/ink — kept external so consumers of the library import don't pull
    // in a TUI dependency they don't need.
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['react', 'ink'],
  },
  {
    // The `purgeit` bin (package.json "bin"). ESM-only, Node-only; built as a
    // second config so the shebang banner never leaks into the library files.
    // clean must stay false or this pass would wipe the entry built above.
    entry: { cli: 'src/cli/cli-main.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
    sourcemap: true,
    clean: false,
    esbuildOptions(options) {
      options.jsx = 'automatic';
      options.jsxImportSource = 'react';
    },
  },
]);
