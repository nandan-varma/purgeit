import type { CleanEvent, CleanSummary, Target } from '../clean/clean.js';
import { DEFAULT_DORMANT_MS, isDormant } from '../scan/projects.js';
import type { Entry, ScanEvent, ScanSummary } from '../scan/scan.js';
import {
  buildListing,
  isDeletable,
  listedEntries,
  type ListState,
  protectedNotice,
  type Row,
  type SortKey,
  type View,
} from './rows.js';

type Phase = 'browse' | 'filter' | 'confirm' | 'cleaning' | 'done' | 'help';

interface Outcome {
  readonly path: string;
  readonly message: string;
}

/** Artifacts below this are hidden by default; there are always more of them than anyone wants to read. */
const DEFAULT_FLOOR = 10 * 1024 * 1024;

export interface State extends ListState {
  readonly phase: Phase;
  /** Directories claimed by a rule so far, and how many of those are fully measured (or dropped). */
  readonly found: number;
  readonly settled: number;
  readonly summary: ScanSummary | undefined;
  /** The row under the cursor, by id. Tracked by id so rows arriving or re-sorting never move it. */
  readonly cursor: string | undefined;
  /** The current time, advanced by the app, so dormancy and ages are pure functions of state. */
  readonly now: number;
  readonly notice: string | undefined;
  readonly cleaning: {
    /** What this clean will delete; fixed when it starts. */
    readonly targets: readonly Target[];
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
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'move'; readonly by: number }
  | { readonly type: 'jump'; readonly to: 'top' | 'bottom' }
  | { readonly type: 'toggle' }
  | { readonly type: 'select-all' }
  | { readonly type: 'select-none' }
  | { readonly type: 'invert' }
  | { readonly type: 'recommend' }
  | { readonly type: 'expand' }
  | { readonly type: 'collapse' }
  | { readonly type: 'expand-all'; readonly open: boolean }
  | { readonly type: 'view' }
  | { readonly type: 'small' }
  | { readonly type: 'sort' }
  | { readonly type: 'reverse' }
  | { readonly type: 'help'; readonly open: boolean }
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
interface KeyPress {
  readonly input: string;
  readonly up?: boolean;
  readonly down?: boolean;
  readonly left?: boolean;
  readonly right?: boolean;
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

export interface InitialOptions {
  readonly now?: number;
  /** Hide artifacts smaller than this until `m` is pressed. 0 shows everything. */
  readonly floor?: number;
  readonly dormantMs?: number;
}

export function initialState(options: InitialOptions = {}): State {
  return {
    phase: 'browse',
    entries: [],
    found: 0,
    settled: 0,
    summary: undefined,
    cursor: undefined,
    selected: new Set(),
    sortKey: 'smart',
    reversed: false,
    view: 'projects',
    expanded: new Set(),
    filter: '',
    floor: options.floor ?? DEFAULT_FLOOR,
    showSmall: false,
    dormantMs: options.dormantMs ?? DEFAULT_DORMANT_MS,
    now: options.now ?? Date.now(),
    notice: undefined,
    cleaning: { targets: [], handled: 0, current: undefined },
    refused: [],
    failed: [],
    result: undefined,
    freedBytes: 0,
    freedCount: 0,
    quit: false,
  };
}

export const listingOf = (state: State) => buildListing(state, state.now);

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

const sum = (groups: readonly { bytes: number }[]): number =>
  groups.reduce((total, group) => total + group.bytes, 0);

/** What could be reclaimed, in total and in dormant projects. */
export function reclaimable(state: Pick<State, 'entries' | 'now' | 'dormantMs'>): {
  readonly bytes: number;
  readonly dormantBytes: number;
  readonly projects: number;
  readonly dormantProjects: number;
} {
  const listing = buildListing(
    {
      ...state,
      filter: '',
      sortKey: 'smart',
      reversed: false,
      view: 'projects',
      expanded: new Set(),
      selected: new Set(),
      floor: 0,
      showSmall: true,
    },
    state.now,
  );
  const dormant = listing.groups.filter((group) => isDormant(group, state.now, state.dormantMs));
  return {
    bytes: sum(listing.groups),
    dormantBytes: sum(dormant),
    projects: listing.groups.filter((group) => group.artifacts > 0).length,
    dormantProjects: dormant.filter((group) => group.artifacts > 0).length,
  };
}

function rowIndex(rows: readonly Row[], cursor: string | undefined): number {
  const index = rows.findIndex((row) => row.id === cursor);
  return index === -1 ? 0 : index;
}

export function cursorRow(state: State): Row | undefined {
  const { rows } = listingOf(state);
  return rows[rowIndex(rows, state.cursor)];
}

export { rowIndex };

function withCursor(state: State, rows: readonly Row[], index: number): State {
  const row = rows[Math.max(0, Math.min(index, rows.length - 1))];
  return { ...state, cursor: row?.id, notice: undefined };
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
      if (key.right || input === 'l') return { type: 'expand' };
      if (key.left || input === 'h') return { type: 'collapse' };
      if (key.pageUp) return { type: 'move', by: -pageSize };
      if (key.pageDown) return { type: 'move', by: pageSize };
      if (key.home || input === 'g') return { type: 'jump', to: 'top' };
      if (key.end || input === 'G') return { type: 'jump', to: 'bottom' };
      if (input === ' ') return { type: 'toggle' };
      if (input === 'a') return { type: 'select-all' };
      if (input === 'n') return { type: 'select-none' };
      if (input === 'i') return { type: 'invert' };
      if (input === 'R') return { type: 'recommend' };
      if (input === 'e') return { type: 'expand-all', open: true };
      if (input === 'E') return { type: 'expand-all', open: false };
      if (input === 'v') return { type: 'view' };
      if (input === 'm') return { type: 'small' };
      if (input === 's') return { type: 'sort' };
      if (input === 'r') return { type: 'reverse' };
      if (input === '/') return { type: 'filter-open' };
      if (input === '?') return { type: 'help', open: true };
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
    case 'help':
      return key.escape || key.enter || input === '?' || input === 'q'
        ? { type: 'help', open: false }
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

const NEXT_SORT: Readonly<Record<SortKey, SortKey>> = {
  smart: 'size',
  size: 'age',
  age: 'name',
  name: 'smart',
};

const NEXT_VIEW: Readonly<Record<View, View>> = { projects: 'artifacts', artifacts: 'projects' };

function toggleSet(set: ReadonlySet<string>, values: readonly string[], on: boolean): Set<string> {
  const next = new Set(set);
  for (const value of values) {
    if (on) next.add(value);
    else next.delete(value);
  }
  return next;
}

function toggleRow(state: State): State {
  const { rows } = listingOf(state);
  const row = rows[rowIndex(rows, state.cursor)];
  if (row === undefined) return state;
  if (row.type === 'artifact') {
    if (row.entry.protection !== undefined) return { ...state, notice: protectedNotice(row.entry) };
    const selected = new Set(state.selected);
    if (!selected.delete(row.entry.path)) selected.add(row.entry.path);
    return { ...state, selected, notice: undefined };
  }
  const paths = row.group.entries.filter(isDeletable).map((entry) => entry.path);
  if (paths.length === 0) return { ...state, notice: 'Everything in this project is protected.' };
  return {
    ...state,
    selected: toggleSet(state.selected, paths, row.selection !== 'all'),
    notice: undefined,
  };
}

function recommend(state: State): State {
  const { groups } = listingOf(state);
  const dormant = groups.filter((group) => isDormant(group, state.now, state.dormantMs));
  const paths = dormant.flatMap((group) => group.entries.filter(isDeletable).map((e) => e.path));
  if (paths.length === 0) {
    return {
      ...state,
      notice: 'No dormant projects to recommend — everything was touched recently.',
    };
  }
  const bytes = sum(dormant);
  return {
    ...state,
    selected: toggleSet(state.selected, paths, true),
    notice: `Selected ${paths.length} artifact${paths.length === 1 ? '' : 's'} in ${dormant.length} dormant project${dormant.length === 1 ? '' : 's'} (${(bytes / 1024 ** 3).toFixed(1)} GB). Review with enter.`,
  };
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
    case 'tick':
      return { ...state, now: action.now };

    case 'move': {
      const { rows } = listingOf(state);
      return withCursor(state, rows, rowIndex(rows, state.cursor) + action.by);
    }
    case 'jump': {
      const { rows } = listingOf(state);
      return withCursor(state, rows, action.to === 'top' ? 0 : rows.length - 1);
    }

    case 'toggle':
      return toggleRow(state);
    case 'select-all':
      return {
        ...state,
        selected: toggleSet(
          state.selected,
          listedEntries(state)
            .filter(isDeletable)
            .map((entry) => entry.path),
          true,
        ),
        notice: undefined,
      };
    case 'select-none':
      return { ...state, selected: new Set(), notice: undefined };
    case 'invert': {
      const selected = new Set(state.selected);
      for (const entry of listedEntries(state).filter(isDeletable)) {
        if (!selected.delete(entry.path)) selected.add(entry.path);
      }
      return { ...state, selected, notice: undefined };
    }
    case 'recommend':
      return recommend(state);

    case 'expand':
    case 'collapse': {
      const { rows } = listingOf(state);
      const row = rows[rowIndex(rows, state.cursor)];
      if (row === undefined) return state;
      if (row.type === 'artifact') {
        // ← on a nested artifact jumps to its project
        const parent = rows.find(
          (candidate) =>
            candidate.type === 'project' && candidate.group.key === row.entry.project.group,
        );
        return action.type === 'collapse' && row.nested && parent
          ? { ...state, cursor: parent.id, notice: undefined }
          : state;
      }
      return {
        ...state,
        expanded: toggleSet(state.expanded, [row.group.key], action.type === 'expand'),
        notice: undefined,
      };
    }
    case 'expand-all': {
      const keys = listingOf(state).groups.map((group) => group.key);
      return {
        ...state,
        expanded: action.open ? new Set(keys) : new Set(),
        notice: undefined,
      };
    }

    case 'view':
      return { ...state, view: NEXT_VIEW[state.view], notice: undefined };
    case 'small':
      return {
        ...state,
        showSmall: !state.showSmall,
        notice: state.showSmall ? undefined : 'Showing every artifact, including small ones.',
      };
    case 'sort':
      return { ...state, sortKey: NEXT_SORT[state.sortKey], reversed: false, notice: undefined };
    case 'reverse':
      return { ...state, reversed: !state.reversed, notice: undefined };
    case 'help':
      return { ...state, phase: action.open ? 'help' : 'browse', notice: undefined };

    case 'filter-open':
      return { ...state, phase: 'filter', notice: undefined };
    case 'filter-type':
      return { ...state, filter: state.filter + action.text };
    case 'filter-backspace':
      return { ...state, filter: state.filter.slice(0, -1) };
    case 'filter-apply':
      return withCursor({ ...state, phase: 'browse' }, listingOf(state).rows, 0);
    case 'filter-clear':
      return { ...state, phase: 'browse', filter: '' };

    case 'confirm-open':
      return selectedEntries(state).length === 0
        ? {
            ...state,
            notice: 'Nothing selected — space on a row, a for all shown, or R for the recommended.',
          }
        : { ...state, phase: 'confirm', notice: undefined };
    case 'confirm-cancel':
      return { ...state, phase: 'browse' };
    case 'clean-start':
      return {
        ...state,
        phase: 'cleaning',
        cleaning: {
          targets: selectedEntries(state).map((entry) => ({
            path: entry.path,
            bytes: entry.bytes,
            unchangedSince: entry.lastActive,
          })),
          handled: 0,
          current: undefined,
        },
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
      return withCursor(cleared, listingOf(cleared).rows, 0);
    }
  }
}
