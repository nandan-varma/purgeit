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

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

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
              // Warnings are collected and dispatched at scan end
              break;
          }
        }
        if (!cancelled) {
          dispatch({ type: 'SCAN_DONE', warnings: [] });
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
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [state, dispatch];
}
