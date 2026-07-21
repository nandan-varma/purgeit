import { render } from 'ink';
import React from 'react';
import { loadConfig } from '../config/resolve.js';
import { defaultRuleSet, mergeRuleSets } from '../rules/merge.js';
import type { ScanOptions } from '../scan/scanner.js';
import type { ResolvedRuleSet } from '../types.js';
import { App } from './App.js';

export interface TuiOptions {
  root: string;
  signal?: AbortSignal | undefined;
  scanOpts: ScanOptions;
  full?: boolean;
}

export async function runTui(opts: TuiOptions): Promise<number> {
  const loaded = await loadConfig({ cwd: opts.root, noConfig: false });
  const ruleSet = mergeRuleSets(defaultRuleSet(), loaded.config);

  const { unmount, waitUntilExit } = render(
    React.createElement(App, {
      root: opts.root,
      ruleSet,
      scanOpts: opts.scanOpts,
      signal: opts.signal,
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
  return 0;
}
