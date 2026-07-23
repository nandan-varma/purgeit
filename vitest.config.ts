import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Vitest 4 replaces the global `console` with a capturing proxy that
    // lacks a `.Console` constructor; Ink's real render() (used in
    // App.test.tsx's quitting test to exercise waitUntilExit()) calls
    // `new console.Console(...)` via patch-console and throws without this.
    disableConsoleIntercept: true,
    // Rule/scan tests spawn real `du` child processes and exercise the real
    // filesystem (temp-dir fixtures) rather than mocking it. Keeping file
    // parallelism off avoids exhausting posix_spawn on macOS, same rationale
    // as platex's vitest config.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // types.ts is type-only; src/ui/** (Ink components) is exercised via
      // ink-testing-library behavior tests instead of a hard coverage gate —
      // this is the first TUI framework used in the toolkit and rendering
      // branches don't map cleanly onto a 100% statement/branch bar.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/types.ts', 'src/ui/**'],
      reporter: ['text', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
