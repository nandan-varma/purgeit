import { render } from 'ink';
import React from 'react';
import { loadConfig } from '../config/resolve.js';
import { applyCliFilters, defaultRuleSet, mergeRuleSets } from '../rules/merge.js';
import type { ScanOptions } from '../scan/scanner.js';
import { App } from './App.js';
import type { ScanResult } from './result.js';
import type { SortKey } from './state.js';

export interface TuiOptions {
  root: string;
  signal?: AbortSignal | undefined;
  scanOpts: ScanOptions;
  /** Explicit config file path — mirrors headless's --config. */
  configPath?: string | undefined;
  /** Skip config resolution entirely — mirrors headless's --no-config. */
  noConfig?: boolean | undefined;
  /** Disable gated-rule evaluation — mirrors headless's --no-gated. */
  noGated?: boolean | undefined;
  /** Restrict matching to these rule names / target groups — mirrors headless's --targets. */
  targets?: readonly string[] | undefined;
  /** Glob patterns (relative to root) to exclude — mirrors headless's --exclude. */
  exclude?: readonly string[] | undefined;
  /** Skip matches below this size in bytes — mirrors headless's --min-size. */
  minSizeBytes?: number | undefined;
  /** Initial sort key — mirrors headless's --sort. */
  sort?: SortKey | undefined;
  /** Initial sort direction — mirrors headless's --asc. */
  ascending?: boolean | undefined;
  /** Simulate deletion without touching the filesystem — mirrors headless's --dry-run. */
  dryRun?: boolean | undefined;
}

export async function runTui(opts: TuiOptions): Promise<number> {
  let loaded: Awaited<ReturnType<typeof loadConfig>>;
  try {
    loaded = await loadConfig({
      cwd: opts.root,
      configPath: opts.configPath,
      noConfig: opts.noConfig ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`config error: ${message}`);
  }

  const ruleSet = applyCliFilters(
    mergeRuleSets(defaultRuleSet(), loaded.config),
    opts.noGated ?? false,
    opts.targets ?? [],
  );

  let exitCode = 0;
  const { unmount, waitUntilExit } = render(
    React.createElement(App, {
      root: opts.root,
      ruleSet,
      scanOpts: opts.scanOpts,
      signal: opts.signal,
      exclude: opts.exclude,
      minSizeBytes: opts.minSizeBytes,
      initialSortKey: opts.sort,
      initialSortDir: opts.ascending ? 'asc' : 'desc',
      dryRun: opts.dryRun ?? false,
      onResult: (result: ScanResult | null) => {
        if (result?.kind === 'empty') exitCode = 1;
        if (result?.kind === 'delete' && result.failed > 0) exitCode = 1;
      },
    }),
    // App itself handles Ctrl+C via useApp().exit() (see App.tsx's keymap),
    // so Ink's own built-in Ctrl+C listener is redundant and disabled here.
    { exitOnCtrlC: false },
  );

  // Handle SIGINT — unmount gracefully
  if (opts.signal) {
    opts.signal.addEventListener(
      'abort',
      () => {
        unmount();
      },
      { once: true },
    );
  }

  await waitUntilExit();
  return exitCode;
}
