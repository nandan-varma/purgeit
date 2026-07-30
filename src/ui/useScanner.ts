import { useEffect, useReducer } from 'react';
import { createExcludeMatcher } from '../scan/exclude.js';
import type { ScanEntry, ScanOptions } from '../scan/scanner.js';
import { scan } from '../scan/scanner.js';
import type { ResolvedRuleSet } from '../types.js';
import type { ScanResult } from './result.js';
import { type Action, type AppState, initialState, reducer, type SortKey } from './state.js';

export interface UseScannerOptions {
  /** Glob patterns (relative to root) to exclude — mirrors headless's --exclude. */
  readonly exclude?: readonly string[] | undefined;
  /** Skip matches below this size in bytes — mirrors headless's --min-size. */
  readonly minSizeBytes?: number | undefined;
  /** Skip matches newer than this age in ms — mirrors headless's --min-age. */
  readonly minAgeMs?: number | undefined;
  /** Skip matches older than this age in ms — mirrors headless's --max-age. */
  readonly maxAgeMs?: number | undefined;
  /** Initial sort key — mirrors headless's --sort. Defaults to 'size'. */
  readonly initialSortKey?: SortKey | undefined;
  /** Initial sort direction — mirrors headless's --asc. Defaults to 'desc'. */
  readonly initialSortDir?: 'asc' | 'desc' | undefined;
  /** Called when the scan finishes with no entries so the caller can set the exit code. */
  readonly onResult?: ((result: ScanResult | null) => void) | undefined;
}

export function useScanner(
  root: string,
  ruleSet: ResolvedRuleSet,
  opts: ScanOptions,
  uiOpts: UseScannerOptions = {},
): [AppState, React.Dispatch<Action>] {
  const exclude = uiOpts.exclude ?? [];
  const minSizeBytes = uiOpts.minSizeBytes ?? 0;
  const minAgeMs = uiOpts.minAgeMs;
  const maxAgeMs = uiOpts.maxAgeMs;
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
    const needsSize = minSizeBytes > 0;
    const needsAge = minAgeMs !== undefined || maxAgeMs !== undefined;
    // Entries discovered but awaiting size/lastModified resolution before we
    // know whether --min-size/--min-age/--max-age let them through — kept
    // out of the reducer entirely until then, rather than added-then-removed,
    // so a filtered-out match never flashes into the visible list.
    const pending = new Map<string, ScanEntry>();

    function isReady(entry: ScanEntry): boolean {
      if (needsSize && entry.size === null) return false;
      if (needsAge && entry.lastModified === null) return false;
      return true;
    }
    function passesFilters(entry: ScanEntry): boolean {
      if (needsSize && (entry.size ?? 0) < minSizeBytes) return false;
      if (needsAge) {
        if (entry.lastModified === null) return false;
        const age = Date.now() - entry.lastModified;
        if (minAgeMs !== undefined && age < minAgeMs) return false;
        if (maxAgeMs !== undefined && age > maxAgeMs) return false;
      }
      return true;
    }

    let cancelled = false;
    let foundAny = false;
    const warnings: AppState['warnings'] = [];

    const run = async () => {
      try {
        for await (const event of scan(root, ruleSet, { ...opts, signal: controller.signal })) {
          if (cancelled) break;
          switch (event.type) {
            case 'found':
              if (isExcluded(event.entry.path)) break;
              if (needsSize || needsAge) {
                pending.set(event.entry.path, event.entry);
              } else {
                foundAny = true;
                dispatch({ type: 'ADD_ENTRY', entry: event.entry });
              }
              break;
            case 'size': {
              const pendingEntry = pending.get(event.path);
              if (pendingEntry) {
                const updated = { ...pendingEntry, size: event.bytes };
                if (isReady(updated)) {
                  pending.delete(event.path);
                  if (passesFilters(updated)) {
                    foundAny = true;
                    dispatch({ type: 'ADD_ENTRY', entry: updated });
                  }
                } else {
                  pending.set(event.path, updated);
                }
              } else {
                dispatch({ type: 'UPDATE_SIZE', path: event.path, bytes: event.bytes });
              }
              break;
            }
            case 'lastModified': {
              const pendingEntry = pending.get(event.path);
              if (pendingEntry) {
                const updated = { ...pendingEntry, lastModified: event.mtimeMs };
                if (isReady(updated)) {
                  pending.delete(event.path);
                  if (passesFilters(updated)) {
                    foundAny = true;
                    dispatch({ type: 'ADD_ENTRY', entry: updated });
                  }
                } else {
                  pending.set(event.path, updated);
                }
              } else {
                dispatch({
                  type: 'UPDATE_LAST_MODIFIED',
                  path: event.path,
                  mtimeMs: event.mtimeMs,
                });
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
          if (!foundAny) {
            uiOpts.onResult?.({ kind: 'empty' });
          }
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
