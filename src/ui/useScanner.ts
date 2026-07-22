import { useEffect, useReducer } from 'react';
import { createExcludeMatcher } from '../scan/exclude.js';
import type { ScanEntry, ScanOptions } from '../scan/scanner.js';
import { scan } from '../scan/scanner.js';
import type { ResolvedRuleSet } from '../types.js';
import { type Action, type AppState, initialState, reducer, type SortKey } from './state.js';

export interface UseScannerOptions {
  /** Glob patterns (relative to root) to exclude — mirrors headless's --exclude. */
  readonly exclude?: readonly string[] | undefined;
  /** Skip matches below this size in bytes — mirrors headless's --min-size. */
  readonly minSizeBytes?: number | undefined;
  /** Initial sort key — mirrors headless's --sort. Defaults to 'size'. */
  readonly initialSortKey?: SortKey | undefined;
  /** Initial sort direction — mirrors headless's --asc. Defaults to 'desc'. */
  readonly initialSortDir?: 'asc' | 'desc' | undefined;
}

export function useScanner(
  root: string,
  ruleSet: ResolvedRuleSet,
  opts: ScanOptions,
  uiOpts: UseScannerOptions = {},
): [AppState, React.Dispatch<Action>] {
  const exclude = uiOpts.exclude ?? [];
  const minSizeBytes = uiOpts.minSizeBytes ?? 0;
  const initialSortKey = uiOpts.initialSortKey ?? 'size';
  const initialSortDir = uiOpts.initialSortDir ?? 'desc';

  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(initialSortKey, initialSortDir),
  );

  // Run once on mount — root/ruleSet/opts/uiOpts are supplied once from
  // cli.ts's single App render and are never expected to change identity for
  // the lifetime of the TUI, so re-running on their identity isn't meaningful.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — see comment above
  useEffect(() => {
    const controller = new AbortController();
    const isExcluded = createExcludeMatcher(root, exclude);
    // Entries discovered but awaiting their first size resolution before we
    // know whether --min-size lets them through — kept out of the reducer
    // entirely until then, rather than added-then-removed, so a match below
    // the threshold never flashes into the visible list.
    const pending = new Map<string, ScanEntry>();

    let cancelled = false;
    const warnings: AppState['warnings'] = [];

    const run = async () => {
      try {
        for await (const event of scan(root, ruleSet, { ...opts, signal: controller.signal })) {
          if (cancelled) break;
          switch (event.type) {
            case 'found':
              if (isExcluded(event.entry.path)) break;
              if (minSizeBytes > 0) {
                pending.set(event.entry.path, event.entry);
              } else {
                dispatch({ type: 'ADD_ENTRY', entry: event.entry });
              }
              break;
            case 'size': {
              const pendingEntry = pending.get(event.path);
              if (pendingEntry) {
                pending.delete(event.path);
                if (event.bytes >= minSizeBytes) {
                  dispatch({ type: 'ADD_ENTRY', entry: { ...pendingEntry, size: event.bytes } });
                }
              } else {
                dispatch({ type: 'UPDATE_SIZE', path: event.path, bytes: event.bytes });
              }
              break;
            }
            case 'warning':
              // Collected here and dispatched together at scan end, rather
              // than one dispatch per warning, to match SCAN_DONE's shape.
              warnings.push(event.warning);
              break;
          }
        }
        if (!cancelled) {
          dispatch({ type: 'SCAN_DONE', warnings });
        }
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: 'SET_ERROR',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return [state, dispatch];
}
