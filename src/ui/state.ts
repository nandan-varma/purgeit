import type { ScanEntry } from '../scan/scanner.js';
import type { ValidationWarning } from '../types.js';

export type Phase = 'scanning' | 'ready' | 'confirming' | 'deleting' | 'done' | 'error';

export type SortKey = 'size' | 'path' | 'name';

export interface AppState {
  phase: Phase;
  entries: ScanEntry[];
  cursor: number;
  selected: Set<string>;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  scanDone: boolean;
  warnings: ValidationWarning[];
  deletion: { deleted: number; failed: number } | null;
  error: string | null;
}

export type Action =
  | { type: 'ADD_ENTRY'; entry: ScanEntry }
  | { type: 'UPDATE_SIZE'; path: string; bytes: number }
  | { type: 'SCAN_DONE'; warnings: ValidationWarning[] }
  | { type: 'MOVE_CURSOR'; delta: number }
  | { type: 'SET_CURSOR'; index: number }
  | { type: 'TOGGLE_SELECT' }
  | { type: 'SELECT_ALL' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'INVERT_SELECTION' }
  | { type: 'CYCLE_SORT' }
  | { type: 'REVERSE_SORT' }
  | { type: 'ENTER_CONFIRM' }
  | { type: 'CANCEL_CONFIRM' }
  | { type: 'START_DELETE' }
  | { type: 'DELETE_DONE'; deleted: number; failed: number }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'QUIT' };

export const SORT_KEYS: readonly SortKey[] = ['size', 'path', 'name'];

export function initialState(): AppState {
  return {
    phase: 'scanning',
    entries: [],
    cursor: 0,
    selected: new Set<string>(),
    sortKey: 'size',
    sortDir: 'desc',
    scanDone: false,
    warnings: [],
    deletion: null,
    error: null,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_ENTRY':
      return { ...state, entries: [...state.entries, action.entry] };

    case 'UPDATE_SIZE': {
      const entries = state.entries.map((e) =>
        e.path === action.path ? { ...e, size: action.bytes } : e,
      );
      return { ...state, entries };
    }

    case 'SCAN_DONE':
      return {
        ...state,
        phase: state.entries.length > 0 ? 'ready' : 'done',
        scanDone: true,
        warnings: action.warnings,
        deletion: state.entries.length === 0 ? { deleted: 0, failed: 0 } : null,
      };

    case 'MOVE_CURSOR': {
      const len = state.entries.length;
      const cursor = len === 0 ? 0 : (state.cursor + action.delta + len) % len;
      return { ...state, cursor };
    }

    case 'SET_CURSOR':
      return { ...state, cursor: Math.max(0, Math.min(action.index, state.entries.length - 1)) };

    case 'TOGGLE_SELECT': {
      const entry = state.entries[state.cursor];
      if (!entry) return state;
      const selected = new Set(state.selected);
      if (selected.has(entry.path)) {
        selected.delete(entry.path);
      } else {
        selected.add(entry.path);
      }
      return { ...state, selected };
    }

    case 'SELECT_ALL': {
      const selected = new Set(state.entries.map((e) => e.path));
      return { ...state, selected };
    }

    case 'CLEAR_SELECTION':
      return { ...state, selected: new Set() };

    case 'INVERT_SELECTION': {
      const selected = new Set(state.selected);
      for (const entry of state.entries) {
        if (selected.has(entry.path)) {
          selected.delete(entry.path);
        } else {
          selected.add(entry.path);
        }
      }
      return { ...state, selected };
    }

    case 'CYCLE_SORT': {
      const idx = SORT_KEYS.indexOf(state.sortKey);
      const sortKey = SORT_KEYS[(idx + 1) % SORT_KEYS.length] as SortKey;
      return { ...state, sortKey };
    }

    case 'REVERSE_SORT':
      return { ...state, sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' };

    case 'ENTER_CONFIRM':
      return { ...state, phase: 'confirming' };

    case 'CANCEL_CONFIRM':
      return { ...state, phase: 'ready' };

    case 'START_DELETE':
      return { ...state, phase: 'deleting' };

    case 'DELETE_DONE':
      return {
        ...state,
        phase: 'done',
        deletion: { deleted: action.deleted, failed: action.failed },
      };

    case 'SET_ERROR':
      return { ...state, phase: 'error', error: action.message };

    case 'QUIT':
      return { ...state, phase: 'done' };
  }
}
