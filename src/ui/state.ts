import { basename } from 'node:path';
import type { ScanEntry } from '../scan/scanner.js';
import type { ValidationWarning } from '../types.js';

export type Phase = 'scanning' | 'ready' | 'confirming' | 'deleting' | 'done' | 'error';

export type SortKey = 'size' | 'path' | 'name';
export type View = 'projects' | 'artifacts';

export interface ProjectGroup {
  readonly name: string;
  readonly entries: readonly ScanEntry[];
  readonly totalSize: number;
  readonly newestModified: number | null;
}

export interface AppState {
  phase: Phase;
  entries: ScanEntry[];
  cursor: number;
  selected: Set<string>;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  view: View;
  scanDone: boolean;
  warnings: ValidationWarning[];
  deletion: { deleted: number; failed: number } | null;
  error: string | null;
}

export type Action =
  | { type: 'ADD_ENTRY'; entry: ScanEntry }
  | { type: 'UPDATE_SIZE'; path: string; bytes: number }
  | { type: 'UPDATE_LAST_MODIFIED'; path: string; mtimeMs: number }
  | { type: 'SCAN_DONE'; warnings: ValidationWarning[] }
  | { type: 'MOVE_CURSOR'; delta: number }
  | { type: 'SET_CURSOR'; index: number }
  | { type: 'TOGGLE_SELECT' }
  | { type: 'SELECT_ALL' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'INVERT_SELECTION' }
  | { type: 'CYCLE_SORT' }
  | { type: 'REVERSE_SORT' }
  | { type: 'TOGGLE_VIEW' }
  | { type: 'ENTER_CONFIRM' }
  | { type: 'CANCEL_CONFIRM' }
  | { type: 'START_DELETE' }
  | { type: 'DELETE_DONE'; deleted: number; failed: number }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'QUIT' };

export const SORT_KEYS: readonly SortKey[] = ['size', 'path', 'name'];

/**
 * The entries in current display order. `cursor` and `TOGGLE_SELECT` index
 * into this, not the raw discovery-order `entries` array, so the row a user
 * sees highlighted is always the one space/enter actually act on.
 */
export function sortedEntries(
  state: Pick<AppState, 'entries' | 'sortKey' | 'sortDir'>,
): ScanEntry[] {
  const dir = state.sortDir === 'asc' ? 1 : -1;
  return [...state.entries].sort((a, b) => {
    if (state.sortKey === 'size') return dir * ((a.size ?? 0) - (b.size ?? 0));
    if (state.sortKey === 'name') return dir * basename(a.path).localeCompare(basename(b.path));
    return dir * a.path.localeCompare(b.path);
  });
}

/** Groups candidates into the cleanup opportunities users actually reason about. */
export function projectGroups(state: Pick<AppState, 'entries' | 'sortDir'>): ProjectGroup[] {
  const groups = new Map<string, ScanEntry[]>();
  for (const entry of state.entries) {
    const entries = groups.get(entry.project) ?? [];
    entries.push(entry);
    groups.set(entry.project, entries);
  }
  const direction = state.sortDir === 'asc' ? 1 : -1;
  return [...groups.entries()]
    .map(([name, entries]) => ({
      name,
      entries,
      totalSize: entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0),
      newestModified: entries.reduce<number | null>(
        (newest, entry) =>
          entry.lastModified === null || (newest !== null && newest >= entry.lastModified)
            ? newest
            : entry.lastModified,
        null,
      ),
    }))
    .sort((a, b) => direction * (a.totalSize - b.totalSize));
}

export function initialState(
  sortKey: SortKey = 'size',
  sortDir: 'asc' | 'desc' = 'desc',
): AppState {
  return {
    phase: 'scanning',
    entries: [],
    cursor: 0,
    selected: new Set<string>(),
    sortKey,
    sortDir,
    view: 'projects',
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
      const idx = state.entries.findIndex((e) => e.path === action.path);
      if (idx === -1) return state;
      const entries = state.entries.slice();
      // biome-ignore lint/style/noNonNullAssertion: idx was checked above
      entries[idx] = { ...state.entries[idx]!, size: action.bytes };
      return { ...state, entries };
    }

    case 'UPDATE_LAST_MODIFIED': {
      const idx = state.entries.findIndex((e) => e.path === action.path);
      if (idx === -1) return state;
      const entries = state.entries.slice();
      // biome-ignore lint/style/noNonNullAssertion: idx was checked above
      entries[idx] = { ...state.entries[idx]!, lastModified: action.mtimeMs };
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
      const len = state.view === 'projects' ? projectGroups(state).length : state.entries.length;
      const cursor = len === 0 ? 0 : (state.cursor + action.delta + len) % len;
      return { ...state, cursor };
    }

    case 'SET_CURSOR':
      return {
        ...state,
        cursor: Math.max(
          0,
          Math.min(
            action.index,
            (state.view === 'projects' ? projectGroups(state).length : state.entries.length) - 1,
          ),
        ),
      };

    case 'TOGGLE_SELECT': {
      if (state.view === 'projects') {
        const group = projectGroups(state)[state.cursor];
        if (!group) return state;
        const selected = new Set(state.selected);
        const allSelected = group.entries.every((entry) => selected.has(entry.path));
        for (const entry of group.entries) {
          if (allSelected) selected.delete(entry.path);
          else selected.add(entry.path);
        }
        return { ...state, selected };
      }
      const entry = sortedEntries(state)[state.cursor];
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

    case 'TOGGLE_VIEW':
      return { ...state, view: state.view === 'projects' ? 'artifacts' : 'projects', cursor: 0 };

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
