import type { CleanEvent, CleanSummary } from '../clean/clean.js';
import { PROTECTION_LABELS } from '../fs/protection.js';
import type { Entry, ScanEvent, ScanSummary } from '../scan/scan.js';

export type Phase = 'browse' | 'filter' | 'confirm' | 'cleaning' | 'done';
export type SortKey = 'size' | 'age' | 'path';

export const SORT_KEYS: readonly SortKey[] = ['size', 'age', 'path'];

export interface Outcome {
  readonly path: string;
  readonly message: string;
}

export interface State {
  readonly phase: Phase;
  readonly entries: readonly Entry[];
  /** Directories claimed by a rule so far, and how many of those are fully measured (or dropped). */
  readonly found: number;
  readonly settled: number;
  readonly summary: ScanSummary | undefined;
  /** Path under the cursor. Tracked by path so rows arriving or re-sorting never move it. */
  readonly cursor: string | undefined;
  readonly selected: ReadonlySet<string>;
  readonly sortKey: SortKey;
  readonly descending: boolean;
  readonly filter: string;
  readonly notice: string | undefined;
  readonly cleaning: {
    readonly total: number;
    readonly handled: number;
    readonly current: string | undefined;
  };
  readonly refused: readonly Outcome[];
  readonly failed: readonly Outcome[];
  /** Result of the most recent clean, and the running total across cleans. */
  readonly result: CleanSummary | undefined;
  readonly freedBytes: number;
  readonly freedCount: number;
  /** Set when the user asked to leave; the app exits on its next render. */
  readonly quit: boolean;
}

export type Action =
  | { readonly type: 'scan'; readonly event: ScanEvent }
  | { readonly type: 'clean'; readonly event: CleanEvent }
  | { readonly type: 'move'; readonly by: number }
  | { readonly type: 'jump'; readonly to: 'top' | 'bottom' }
  | { readonly type: 'toggle' }
  | { readonly type: 'select-all' }
  | { readonly type: 'select-none' }
  | { readonly type: 'invert' }
  | { readonly type: 'sort' }
  | { readonly type: 'reverse' }
  | { readonly type: 'filter-open' }
  | { readonly type: 'filter-type'; readonly text: string }
  | { readonly type: 'filter-backspace' }
  | { readonly type: 'filter-apply' }
  | { readonly type: 'filter-clear' }
  | { readonly type: 'confirm-open' }
  | { readonly type: 'confirm-cancel' }
  | { readonly type: 'clean-start' }
  | { readonly type: 'back' }
  | { readonly type: 'key'; readonly key: KeyPress; readonly pageSize: number };

/** A key press, reduced to what the keymap cares about. */
export interface KeyPress {
  readonly input: string;
  readonly up?: boolean;
  readonly down?: boolean;
  readonly pageUp?: boolean;
  readonly pageDown?: boolean;
  readonly home?: boolean;
  readonly end?: boolean;
  readonly enter?: boolean;
  readonly escape?: boolean;
  readonly backspace?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
}

type Intent = Action | 'quit' | undefined;

/**
 * Maps a key to what it does in the current phase. Lives in the reducer, not
 * in an input handler, so keys that arrive faster than a re-render (a paste,
 * key repeat) are always interpreted against the latest state.
 */
function intentFor(state: State, key: KeyPress, pageSize: number): Intent {
  const { input } = key;
  switch (state.phase) {
    case 'browse':
      if (key.up || input === 'k') return { type: 'move', by: -1 };
      if (key.down || input === 'j') return { type: 'move', by: 1 };
      if (key.pageUp) return { type: 'move', by: -pageSize };
      if (key.pageDown) return { type: 'move', by: pageSize };
      if (key.home || input === 'g') return { type: 'jump', to: 'top' };
      if (key.end || input === 'G') return { type: 'jump', to: 'bottom' };
      if (input === ' ') return { type: 'toggle' };
      if (input === 'a') return { type: 'select-all' };
      if (input === 'n') return { type: 'select-none' };
      if (input === 'i') return { type: 'invert' };
      if (input === 's') return { type: 'sort' };
      if (input === 'r') return { type: 'reverse' };
      if (input === '/') return { type: 'filter-open' };
      if (key.escape && state.filter !== '') return { type: 'filter-clear' };
      if (key.enter) return { type: 'confirm-open' };
      return input === 'q' ? 'quit' : undefined;
    case 'filter':
      if (key.escape) return { type: 'filter-clear' };
      if (key.enter) return { type: 'filter-apply' };
      if (key.backspace) return { type: 'filter-backspace' };
      if (key.up) return { type: 'move', by: -1 };
      if (key.down) return { type: 'move', by: 1 };
      return input !== '' && !key.ctrl && !key.meta
        ? { type: 'filter-type', text: input }
        : undefined;
    case 'confirm':
      if (input === 'y') return { type: 'clean-start' };
      return key.escape || input === 'n' ? { type: 'confirm-cancel' } : undefined;
    case 'done':
      if (input === 'b' || key.enter) return { type: 'back' };
      return input === 'q' ? 'quit' : undefined;
    case 'cleaning':
      return undefined;
  }
}

export function initialState(): State {
  return {
    phase: 'browse',
    entries: [],
    found: 0,
    settled: 0,
    summary: undefined,
    cursor: undefined,
    selected: new Set(),
    sortKey: 'size',
    descending: true,
    filter: '',
    notice: undefined,
    cleaning: { total: 0, handled: 0, current: undefined },
    refused: [],
    failed: [],
    result: undefined,
    freedBytes: 0,
    freedCount: 0,
    quit: false,
  };
}

const isDeletable = (entry: Entry): boolean => entry.protection === undefined;

/** What the list shows: filtered, sorted, protected entries always last. */
export function visibleEntries(
  state: Pick<State, 'entries' | 'filter' | 'sortKey' | 'descending'>,
): Entry[] {
  const needle = state.filter.trim().toLowerCase();
  const shown =
    needle === ''
      ? [...state.entries]
      : state.entries.filter(
          (entry) =>
            entry.path.toLowerCase().includes(needle) ||
            entry.rule.name.toLowerCase().includes(needle),
        );
  const direction = state.descending ? -1 : 1;
  const compare = (a: Entry, b: Entry): number => {
    if (state.sortKey === 'size') return a.bytes - b.bytes;
    if (state.sortKey === 'age') return b.lastActive - a.lastActive;
    return a.path.localeCompare(b.path);
  };
  return shown.sort(
    (a, b) =>
      Number(!isDeletable(a)) - Number(!isDeletable(b)) ||
      direction * compare(a, b) ||
      a.path.localeCompare(b.path),
  );
}

export function selectedEntries(state: Pick<State, 'entries' | 'selected'>): Entry[] {
  return state.entries.filter((entry) => state.selected.has(entry.path));
}

/** Total bytes and count of what is selected. */
export function selectionTotals(state: Pick<State, 'entries' | 'selected'>): {
  count: number;
  bytes: number;
} {
  const chosen = selectedEntries(state);
  return { count: chosen.length, bytes: chosen.reduce((sum, entry) => sum + entry.bytes, 0) };
}

/** Total of what could be reclaimed among everything found. */
export function reclaimableBytes(state: Pick<State, 'entries'>): number {
  return state.entries.filter(isDeletable).reduce((sum, entry) => sum + entry.bytes, 0);
}

function withCursor(state: State, visible: readonly Entry[], index: number): State {
  const entry = visible[Math.max(0, Math.min(index, visible.length - 1))];
  return { ...state, cursor: entry?.path, notice: undefined };
}

export function cursorIndex(state: Pick<State, 'cursor'>, visible: readonly Entry[]): number {
  const index = visible.findIndex((entry) => entry.path === state.cursor);
  return index === -1 ? 0 : index;
}

function reduceScan(state: State, event: ScanEvent): State {
  switch (event.type) {
    case 'found':
      return { ...state, found: state.found + 1 };
    case 'dropped':
      return { ...state, settled: state.settled + 1 };
    case 'entry':
      return {
        ...state,
        settled: state.settled + 1,
        entries: [...state.entries, event.entry],
      };
    case 'done':
      return { ...state, summary: event.summary };
  }
}

function reduceClean(state: State, event: CleanEvent): State {
  const handled = state.cleaning.handled;
  switch (event.type) {
    case 'start':
      return { ...state, cleaning: { ...state.cleaning, current: event.path } };
    case 'deleted':
      return { ...state, cleaning: { ...state.cleaning, handled: handled + 1 } };
    case 'refused':
      return {
        ...state,
        cleaning: { ...state.cleaning, handled: handled + 1 },
        refused: [...state.refused, { path: event.path, message: event.refusal.message }],
      };
    case 'failed':
      return {
        ...state,
        cleaning: { ...state.cleaning, handled: handled + 1 },
        failed: [...state.failed, { path: event.path, message: event.message }],
      };
    case 'warning':
      return { ...state, notice: event.message };
    case 'done':
      return {
        ...state,
        phase: 'done',
        result: event.summary,
        freedBytes: state.freedBytes + event.summary.bytes,
        freedCount: state.freedCount + event.summary.deleted,
      };
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'key': {
      const intent = intentFor(state, action.key, action.pageSize);
      if (intent === 'quit') return { ...state, quit: true };
      return intent === undefined ? state : reducer(state, intent);
    }
    case 'scan':
      return reduceScan(state, action.event);
    case 'clean':
      return reduceClean(state, action.event);

    case 'move': {
      const visible = visibleEntries(state);
      return withCursor(state, visible, cursorIndex(state, visible) + action.by);
    }
    case 'jump': {
      const visible = visibleEntries(state);
      return withCursor(state, visible, action.to === 'top' ? 0 : visible.length - 1);
    }

    case 'toggle': {
      const visible = visibleEntries(state);
      const entry = visible[cursorIndex(state, visible)];
      if (entry === undefined) return state;
      if (!isDeletable(entry)) {
        return {
          ...state,
          notice: `Protected — ${PROTECTION_LABELS[entry.protection as keyof typeof PROTECTION_LABELS]}; it can never be selected.`,
        };
      }
      const selected = new Set(state.selected);
      if (!selected.delete(entry.path)) selected.add(entry.path);
      return { ...state, selected, notice: undefined };
    }
    case 'select-all':
      return {
        ...state,
        selected: new Set([
          ...state.selected,
          ...visibleEntries(state)
            .filter(isDeletable)
            .map((e) => e.path),
        ]),
        notice: undefined,
      };
    case 'select-none':
      return { ...state, selected: new Set(), notice: undefined };
    case 'invert': {
      const selected = new Set(state.selected);
      for (const entry of visibleEntries(state).filter(isDeletable)) {
        if (!selected.delete(entry.path)) selected.add(entry.path);
      }
      return { ...state, selected, notice: undefined };
    }

    case 'sort': {
      const next = SORT_KEYS[(SORT_KEYS.indexOf(state.sortKey) + 1) % SORT_KEYS.length] as SortKey;
      return { ...state, sortKey: next, descending: next !== 'path', notice: undefined };
    }
    case 'reverse':
      return { ...state, descending: !state.descending, notice: undefined };

    case 'filter-open':
      return { ...state, phase: 'filter', notice: undefined };
    case 'filter-type':
      return { ...state, filter: state.filter + action.text };
    case 'filter-backspace':
      return { ...state, filter: state.filter.slice(0, -1) };
    case 'filter-apply':
      return { ...withCursor({ ...state, phase: 'browse' }, visibleEntries(state), 0) };
    case 'filter-clear':
      return { ...state, phase: 'browse', filter: '' };

    case 'confirm-open':
      return selectedEntries(state).length === 0
        ? { ...state, notice: 'Nothing selected — press space on a row, or a to select all.' }
        : { ...state, phase: 'confirm', notice: undefined };
    case 'confirm-cancel':
      return { ...state, phase: 'browse' };
    case 'clean-start':
      return {
        ...state,
        phase: 'cleaning',
        cleaning: { total: selectedEntries(state).length, handled: 0, current: undefined },
        refused: [],
        failed: [],
        result: undefined,
      };

    case 'back': {
      // Leave the summary: drop what was deleted, keep what was refused or failed.
      const keep = new Set([...state.refused, ...state.failed].map((outcome) => outcome.path));
      const entries = state.entries.filter(
        (entry) => !state.selected.has(entry.path) || keep.has(entry.path),
      );
      const cleared = { ...state, phase: 'browse' as const, entries, selected: new Set<string>() };
      return withCursor(cleared, visibleEntries(cleared), 0);
    }
  }
}
