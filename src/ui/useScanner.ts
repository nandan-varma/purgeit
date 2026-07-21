import { useEffect, useReducer, useRef } from 'react';
import type { ScanOptions } from '../scan/scanner.js';
import { scan } from '../scan/scanner.js';
import type { ResolvedRuleSet } from '../types.js';
import { type Action, type AppState, initialState, reducer } from './state.js';

export function useScanner(
  root: string,
  ruleSet: ResolvedRuleSet,
  opts: ScanOptions,
): [AppState, React.Dispatch<Action>] {
  const [state, dispatch] = useReducer(reducer, null, initialState);
  const abortRef = useRef<AbortController | null>(null);

  // Run once on mount — root/ruleSet/opts are supplied once from cli.ts's
  // single App render and are never expected to change identity for the
  // lifetime of the TUI, so re-running on their identity isn't meaningful.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — see comment above
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    const warnings: AppState['warnings'] = [];

    const run = async () => {
      try {
        for await (const event of scan(root, ruleSet, { ...opts, signal: controller.signal })) {
          if (cancelled) break;
          switch (event.type) {
            case 'found':
              dispatch({ type: 'ADD_ENTRY', entry: event.entry });
              break;
            case 'size':
              dispatch({ type: 'UPDATE_SIZE', path: event.path, bytes: event.bytes });
              break;
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
          dispatch({ type: 'SET_ERROR', message: (err as Error).message });
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
