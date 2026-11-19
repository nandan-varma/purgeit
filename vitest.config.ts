import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    {
      name: 'markdown-as-text',
      transform: (code, id) =>
        id.endsWith('.md')
          ? { code: `export default ${JSON.stringify(code)};`, map: null }
          : undefined,
    },
  ],
  define: { __VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // Ink's real render() builds a `console.Console`, which Vitest's capturing proxy lacks.
    disableConsoleIntercept: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/tui/**',
        'src/cli/main.ts',
        'src/cli/env.ts',
        'src/rules/catalog/**',
      ],
      thresholds: { lines: 92, functions: 92, branches: 85, statements: 92 },
    },
  },
});
