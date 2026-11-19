import { describe, expect, it } from 'vitest';

import type { Entry } from '../scan/scan.js';
import {
  type Action,
  initialState,
  reclaimableBytes,
  reducer,
  selectionTotals,
  type State,
  visibleEntries,
} from './state.js';

const rule = {
  kind: 'safe',
  name: 'node_modules',
  categories: ['javascript-typescript'],
  description: 'deps',
} as const;

function entry(path: string, bytes: number, extra: Partial<Entry> = {}): Entry {
  return {
    path,
    root: '/r',
    project: '.',
    rule,
    evidence: undefined,
    bytes,
    files: 1,
    lastActive: 1000,
    protection: undefined,
    ...extra,
  };
}

const apply = (state: State, ...actions: Action[]): State => actions.reduce(reducer, state);
const withEntries = (...entries: Entry[]): State =>
  apply(
    initialState(),
    ...entries.map((e): Action => ({ type: 'scan', event: { type: 'entry', entry: e } })),
  );
const paths = (state: State) => visibleEntries(state).map((e) => e.path);

describe('listing', () => {
  const state = withEntries(
    entry('/b', 10, { lastActive: 5 }),
    entry('/a', 30, { lastActive: 9 }),
    entry('/c', 20, { lastActive: 1 }),
  );

  it('sorts by size descending, with protected entries always last', () => {
    expect(paths(state)).toEqual(['/a', '/c', '/b']);
    const locked = apply(state, {
      type: 'scan',
      event: { type: 'entry', entry: entry('/z', 99, { protection: 'tracked-files' }) },
    });
    expect(paths(locked)).toEqual(['/a', '/c', '/b', '/z']);
  });

  it('cycles sort keys and reverses', () => {
    expect(paths(apply(state, { type: 'sort' }))).toEqual(['/c', '/b', '/a']); // age: oldest first
    expect(paths(apply(state, { type: 'sort' }, { type: 'sort' }))).toEqual(['/a', '/b', '/c']); // path asc
    expect(paths(apply(state, { type: 'reverse' }))).toEqual(['/b', '/c', '/a']);
  });

  it('filters by path or rule name, live', () => {
    const typed = apply(
      state,
      { type: 'filter-open' },
      { type: 'filter-type', text: '/' },
      { type: 'filter-type', text: 'a' },
    );
    expect(paths(typed)).toEqual(['/a']);
    expect(paths(apply(typed, { type: 'filter-backspace' }))).toHaveLength(3);
    expect(paths(apply(typed, { type: 'filter-clear' }))).toHaveLength(3);
    expect(apply(typed, { type: 'filter-apply' }).phase).toBe('browse');
    expect(paths(apply(state, { type: 'filter-type', text: 'NODE_MOD' }))).toHaveLength(3);
  });
});

describe('cursor', () => {
  const state = withEntries(entry('/a', 30), entry('/b', 20), entry('/c', 10));
  const at = (s: State) => s.cursor;

  it('moves, clamps and jumps', () => {
    expect(at(apply(state, { type: 'move', by: 1 }))).toBe('/b');
    expect(at(apply(state, { type: 'move', by: 99 }))).toBe('/c');
    expect(at(apply(state, { type: 'move', by: -5 }))).toBe('/a');
    expect(at(apply(state, { type: 'jump', to: 'bottom' }))).toBe('/c');
    expect(at(apply(state, { type: 'jump', to: 'bottom' }, { type: 'jump', to: 'top' }))).toBe(
      '/a',
    );
    expect(at(apply(initialState(), { type: 'move', by: 1 }))).toBeUndefined();
  });

  it('stays on its row when larger entries arrive above it', () => {
    const moved = apply(state, { type: 'move', by: 1 });
    const grown = apply(moved, {
      type: 'scan',
      event: { type: 'entry', entry: entry('/big', 999) },
    });
    expect(at(grown)).toBe('/b');
  });
});

describe('selection', () => {
  const base = withEntries(
    entry('/a', 30),
    entry('/b', 20),
    entry('/lock', 5, { protection: 'deploy-keypair' }),
  );

  it('toggles the row under the cursor and totals the selection', () => {
    const one = apply(base, { type: 'toggle' });
    expect([...one.selected]).toEqual(['/a']);
    expect(selectionTotals(one)).toEqual({ count: 1, bytes: 30 });
    expect(apply(one, { type: 'toggle' }).selected.size).toBe(0);
  });

  it('selects all deletable rows, inverts and clears — never protected ones', () => {
    const all = apply(base, { type: 'select-all' });
    expect([...all.selected].toSorted()).toEqual(['/a', '/b']);
    expect([...apply(all, { type: 'invert' }).selected]).toEqual([]);
    expect(apply(all, { type: 'select-none' }).selected.size).toBe(0);
    const onLock = apply(base, { type: 'jump', to: 'bottom' }, { type: 'toggle' });
    expect(onLock.selected.size).toBe(0);
    expect(onLock.notice).toMatch(/Protected/);
    expect(reclaimableBytes(base)).toBe(50);
  });

  it('ignores toggling an empty list', () => {
    expect(apply(initialState(), { type: 'toggle' }).selected.size).toBe(0);
  });
});

describe('deleting', () => {
  const selected = apply(withEntries(entry('/a', 30), entry('/b', 20)), { type: 'select-all' });

  it('will not ask to confirm with nothing selected', () => {
    const state = apply(withEntries(entry('/a', 1)), { type: 'confirm-open' });
    expect(state.phase).toBe('browse');
    expect(state.notice).toMatch(/Nothing selected/);
  });

  it('walks confirm → cleaning → done, then back to a list without what was deleted', () => {
    let state = apply(selected, { type: 'confirm-open' });
    expect(state.phase).toBe('confirm');
    expect(apply(state, { type: 'confirm-cancel' }).phase).toBe('browse');

    state = apply(
      state,
      { type: 'clean-start' },
      { type: 'clean', event: { type: 'start', path: '/a' } },
      { type: 'clean', event: { type: 'deleted', path: '/a', bytes: 30, dryRun: false } },
      {
        type: 'clean',
        event: {
          type: 'refused',
          path: '/b',
          refusal: { code: 'recently-active', message: 'busy' },
        },
      },
      { type: 'clean', event: { type: 'failed', path: '/x', message: 'EBUSY' } },
      { type: 'clean', event: { type: 'warning', message: 'history' } },
      {
        type: 'clean',
        event: {
          type: 'done',
          summary: { deleted: 1, refused: 1, failed: 1, bytes: 30, dryRun: false },
        },
      },
    );
    expect(state).toMatchObject({
      phase: 'done',
      freedBytes: 30,
      freedCount: 1,
      cleaning: { handled: 3, current: '/a' },
      refused: [{ path: '/b', message: 'busy' }],
      failed: [{ path: '/x', message: 'EBUSY' }],
    });

    const back = apply(state, { type: 'back' });
    expect(back.phase).toBe('browse');
    expect(back.entries.map((e) => e.path)).toEqual(['/b']);
    expect(back.selected.size).toBe(0);
  });
});

describe('scan events', () => {
  it('tracks progress and the final summary', () => {
    const summary = {
      found: 2,
      entries: 1,
      protected: 0,
      dropped: { empty: 1, 'too-small': 0, 'too-recent': 0, unreadable: 0 },
      unreadable: 0,
      bytes: 5,
      durationMs: 1,
    };
    const state = apply(
      initialState(),
      { type: 'scan', event: { type: 'found', path: '/a' } },
      { type: 'scan', event: { type: 'found', path: '/b' } },
      { type: 'scan', event: { type: 'dropped', path: '/b', reason: 'empty' } },
      { type: 'scan', event: { type: 'entry', entry: entry('/a', 5) } },
      { type: 'scan', event: { type: 'done', summary } },
    );
    expect(state).toMatchObject({ found: 2, settled: 2, summary });
  });
});

describe('keymap', () => {
  const press = (state: State, input: string, extra: object = {}) =>
    reducer(state, { type: 'key', key: { input, ...extra }, pageSize: 5 });
  const ready = withEntries(entry('/tar', 3), entry('/other', 2));

  it('reads keys against the current phase, even when they arrive back to back', () => {
    // "/tar" typed in one burst must filter, not select-all ('a') or sort ('s').
    let state = ready;
    for (const input of ['/', 't', 'a', 'r']) state = press(state, input);
    expect(state).toMatchObject({ phase: 'filter', filter: 'tar' });
    expect(state.selected.size).toBe(0);
    expect(paths(state)).toEqual(['/tar']);
  });

  it('drives browsing', () => {
    expect(press(ready, 'j').cursor).toBe('/other');
    expect(press(ready, '', { down: true }).cursor).toBe('/other');
    expect(press(ready, '', { pageDown: true }).cursor).toBe('/other');
    expect(press(ready, 'G').cursor).toBe('/other');
    expect(press(ready, '', { end: true }).cursor).toBe('/other');
    expect(press(press(ready, 'G'), 'g').cursor).toBe('/tar');
    expect(press(ready, ' ').selected.size).toBe(1);
    expect(press(ready, 'a').selected.size).toBe(2);
    expect(press(press(ready, 'a'), 'n').selected.size).toBe(0);
    expect(press(ready, 'i').selected.size).toBe(2);
    expect(press(ready, 's').sortKey).toBe('age');
    expect(press(ready, 'r').descending).toBe(false);
    expect(press(ready, '', { enter: true }).notice).toMatch(/Nothing selected/);
    expect(press(ready, 'x')).toBe(ready);
    expect(press(ready, 'q').quit).toBe(true);
  });

  it('edits and leaves the filter', () => {
    const typing = press(press(ready, '/'), 'o');
    expect(typing.filter).toBe('o');
    expect(press(typing, '', { backspace: true }).filter).toBe('');
    expect(press(typing, '', { enter: true }).phase).toBe('browse');
    expect(press(typing, '', { escape: true })).toMatchObject({ phase: 'browse', filter: '' });
    expect(press(typing, 'c', { ctrl: true })).toBe(typing);
    expect(press(typing, '', { down: true })).toBeDefined();
    expect(press(typing, '', { up: true })).toBeDefined();
    expect(press(press(ready, 'o'), '', { escape: true }).filter).toBe('');
  });

  it('only deletes on y', () => {
    const selected = press(ready, 'a');
    const asking = press(selected, '', { enter: true });
    expect(asking.phase).toBe('confirm');
    expect(press(asking, '', { enter: true }).phase).toBe('confirm');
    expect(press(asking, 'n').phase).toBe('browse');
    expect(press(asking, '', { escape: true }).phase).toBe('browse');
    expect(press(asking, 'y').phase).toBe('cleaning');
    expect(press(press(asking, 'y'), 'q').phase).toBe('cleaning');
  });

  it('leaves the summary with b or q', () => {
    const done = { ...ready, phase: 'done' as const };
    expect(press(done, 'b').phase).toBe('browse');
    expect(press(done, '', { enter: true }).phase).toBe('browse');
    expect(press(done, 'q').quit).toBe(true);
    expect(press(done, 'z')).toBe(done);
  });
});
