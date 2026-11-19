import { describe, expect, it } from 'vitest';

import type { ProjectRef } from '../scan/project.js';
import type { Entry } from '../scan/scan.js';
import { buildListing } from './rows.js';
import {
  type Action,
  cursorRow,
  initialState,
  listingOf,
  reclaimable,
  reducer,
  selectionTotals,
  type State,
} from './state.js';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const MB = 1024 * 1024;

const rule = {
  kind: 'safe',
  name: 'node_modules',
  categories: ['javascript-typescript'],
  description: 'deps',
} as const;

const project = (
  name: string,
  touchedDaysAgo: number | undefined,
  extra: Partial<ProjectRef> = {},
) =>
  ({
    root: `/r/${name}`,
    kind: 'repo',
    group: `/r/${name}`,
    touchedAt: touchedDaysAgo === undefined ? undefined : NOW - touchedDaysAgo * DAY,
    ...extra,
  }) satisfies ProjectRef;

function entry(path: string, bytes: number, proj: ProjectRef, extra: Partial<Entry> = {}): Entry {
  return {
    path,
    root: '/r',
    project: proj,
    rule,
    evidence: undefined,
    bytes,
    files: 1,
    lastActive: NOW - 100 * DAY,
    protection: undefined,
    gitIgnored: undefined,
    synced: undefined,
    ...extra,
  };
}

const add = (state: State, ...entries: Entry[]): State =>
  entries.reduce((s, e) => reducer(s, { type: 'scan', event: { type: 'entry', entry: e } }), state);
const apply = (state: State, ...actions: Action[]): State => actions.reduce(reducer, state);
const press = (state: State, input: string, extra: object = {}) =>
  reducer(state, { type: 'key', key: { input, ...extra }, pageSize: 5 });
const names = (state: State) =>
  listingOf(state).rows.map((row) => (row.type === 'project' ? row.group.name : row.id.slice(2)));

const OLD = project('old', 90);
const BUSY = project('busy', 1);
const MID = project('mid', 40);

/** old (dormant, 2 artifacts), busy (active, big), mid (dormant, medium). */
function fixture(): State {
  return add(
    initialState({ now: NOW, floor: 0 }),
    entry('/r/old/node_modules', 30 * MB, OLD),
    entry('/r/old/dist', 20 * MB, OLD),
    entry('/r/busy/node_modules', 900 * MB, BUSY),
    entry('/r/mid/node_modules', 100 * MB, MID),
  );
}

describe('listing', () => {
  it('shows one row per project, dormant first, then by size', () => {
    expect(names(fixture())).toEqual(['mid', 'old', 'busy']);
    const rows = listingOf(fixture()).rows;
    expect(rows.every((row) => row.type === 'project')).toBe(true);
  });

  it('lists a single project flat — there is nothing to group', () => {
    const single = add(
      initialState({ now: NOW, floor: 0 }),
      entry('/r/old/a', 5 * MB, OLD),
      entry('/r/old/b', 9 * MB, OLD),
    );
    expect(listingOf(single).view).toBe('artifacts');
    expect(names(single)).toEqual(['/r/old/b', '/r/old/a']);
  });

  it('expands and collapses projects, nesting their artifacts largest first', () => {
    let state = fixture();
    state = apply(state, { type: 'jump', to: 'bottom' }, { type: 'move', by: -1 }); // on "old"
    expect(cursorRow(state)?.id).toBe('p:/r/old');
    state = press(state, 'l');
    expect(names(state)).toEqual(['mid', 'old', '/r/old/node_modules', '/r/old/dist', 'busy']);
    state = apply(state, { type: 'move', by: 1 }, { type: 'collapse' });
    expect(cursorRow(state)?.id).toBe('p:/r/old'); // ← from an artifact jumps to its project
    expect(names(press(state, 'h'))).toEqual(['mid', 'old', 'busy']);
    expect(names(press(press(state, 'e'), 'E'))).toEqual(['mid', 'old', 'busy']);
    expect(listingOf(press(state, 'e')).rows).toHaveLength(7);
  });

  it('toggles to the flat artifact list and back', () => {
    const flat = press(fixture(), 'v');
    expect(listingOf(flat).view).toBe('artifacts');
    expect(listingOf(flat).rows).toHaveLength(4);
    expect(listingOf(press(flat, 'v')).view).toBe('projects');
  });

  it('cycles the sort and reverses it', () => {
    let state = press(fixture(), 's');
    expect(names(state)).toEqual(['busy', 'mid', 'old']); // size
    state = press(state, 's');
    expect(names(state)).toEqual(['old', 'mid', 'busy']); // oldest activity first
    state = press(state, 's');
    expect(names(state)).toEqual(['busy', 'mid', 'old']); // name
    expect(names(press(state, 'r'))).toEqual(['old', 'mid', 'busy']);
    expect(press(press(state, 's'), 'r').reversed).toBe(true);
    expect(press(state, 's').sortKey).toBe('smart');
  });

  it('hides artifacts below the floor and says how much it is hiding', () => {
    const state = add(
      initialState({ now: NOW, floor: 10 * MB }),
      entry('/r/old/big', 50 * MB, OLD),
      entry('/r/old/tiny', 1 * MB, OLD),
      entry('/r/busy/tiny', 2 * MB, BUSY),
    );
    const listing = listingOf(state);
    expect(listing.hidden).toEqual({ count: 2, bytes: 3 * MB });
    expect(names(state)).toEqual(['/r/old/big']);
    const shown = press(state, 'm');
    expect(listingOf(shown).hidden.count).toBe(0);
    expect(listingOf(shown).rows).toHaveLength(2); // two projects, collapsed
    expect(press(shown, 'm').showSmall).toBe(false);
  });

  it('filters by project, path or rule, live', () => {
    let state = press(fixture(), '/');
    for (const letter of 'mid') state = press(state, letter);
    expect(names(state)).toEqual(['/r/mid/node_modules']); // one project left → flat
    state = press(state, '', { escape: true });
    expect(state).toMatchObject({ phase: 'browse', filter: '' });
    expect(names(state)).toHaveLength(3);
  });
});

describe('cursor', () => {
  it('tracks its row by id, so arriving rows never move it', () => {
    let state = press(fixture(), 'j'); // "old"
    const before = cursorRow(state)?.id;
    state = add(state, entry('/r/big/node_modules', 5000 * MB, project('big', 100)));
    expect(cursorRow(state)?.id).toBe(before);
  });

  it('moves, clamps and jumps', () => {
    const state = fixture();
    expect(cursorRow(press(state, 'j'))?.id).toBe('p:/r/old');
    expect(cursorRow(apply(state, { type: 'move', by: 99 }))?.id).toBe('p:/r/busy');
    expect(cursorRow(apply(state, { type: 'move', by: -5 }))?.id).toBe('p:/r/mid');
    expect(cursorRow(press(state, 'G'))?.id).toBe('p:/r/busy');
    expect(cursorRow(press(press(state, 'G'), 'g'))?.id).toBe('p:/r/mid');
    expect(cursorRow(initialState())).toBeUndefined();
  });
});

describe('selection', () => {
  it('selecting a project selects every deletable artifact in it, with a tri-state', () => {
    let state = press(fixture(), 'j'); // old
    state = press(state, ' ');
    expect([...state.selected].toSorted()).toEqual(['/r/old/dist', '/r/old/node_modules']);
    expect(listingOf(state).rows.find((r) => r.id === 'p:/r/old')).toMatchObject({
      selection: 'all',
    });

    state = press(press(press(state, 'l'), 'j'), ' '); // unselect one nested artifact
    expect(listingOf(state).rows.find((r) => r.id === 'p:/r/old')).toMatchObject({
      selection: 'some',
    });

    state = press(apply(state, { type: 'collapse' }), ' '); // on the project: "some" → select all
    expect(selectionTotals(state).count).toBe(2);
    expect(press(state, ' ').selected.size).toBe(0);
  });

  it('never selects protected artifacts', () => {
    const locked = entry('/r/old/target', 5 * MB, OLD, { protection: 'tracked-files' });
    let state = add(fixture(), locked);
    state = apply(press(state, 'j'), { type: 'expand' }, { type: 'jump', to: 'bottom' });
    state = apply(state, { type: 'move', by: -1 });
    expect(cursorRow(state)?.id).toBe('a:/r/old/target');
    state = press(state, ' ');
    expect(state.selected.size).toBe(0);
    expect(state.notice).toMatch(/Protected/);
    expect(press(press(state, 'a'), 'a').selected.has('/r/old/target')).toBe(false);

    const onlyLocked = add(
      initialState({ now: NOW, floor: 0 }),
      entry('/r/x/t', MB, project('x', 1), { protection: 'deploy-keypair' }),
      entry('/r/y/t', MB, project('y', 1)),
    );
    expect(press(press(onlyLocked, 'j'), ' ').notice).toMatch(/protected/);
  });

  it('R selects everything in dormant projects, and only there', () => {
    const state = press(fixture(), 'R');
    expect([...state.selected].toSorted()).toEqual([
      '/r/mid/node_modules',
      '/r/old/dist',
      '/r/old/node_modules',
    ]);
    expect(state.notice).toMatch(/3 artifacts in 2 dormant projects/);
    const active = add(
      initialState({ now: NOW, floor: 0 }),
      entry('/r/busy/a', MB, BUSY),
      entry('/r/b2/a', MB, project('b2', 2)),
    );
    expect(press(active, 'R').notice).toMatch(/No dormant/);
  });

  it('a, n and i act on what is listed — the floor and the filter included', () => {
    const state = add(
      initialState({ now: NOW, floor: 10 * MB }),
      entry('/r/old/big', 50 * MB, OLD),
      entry('/r/old/small', MB, OLD),
      entry('/r/busy/big', 60 * MB, BUSY),
    );
    expect(press(state, 'a').selected.size).toBe(2);
    expect(press(press(state, 'a'), 'n').selected.size).toBe(0);
    expect(press(press(state, 'a'), 'i').selected.size).toBe(0);
    expect(press(state, 'i').selected.size).toBe(2);
  });
});

describe('stats', () => {
  it('totals what is reclaimable and what is dormant', () => {
    expect(reclaimable(fixture())).toEqual({
      bytes: 1050 * MB,
      dormantBytes: 150 * MB,
      projects: 3,
      dormantProjects: 2,
    });
  });

  it('keeps dormancy current as the clock advances', () => {
    const later = reducer(fixture(), { type: 'tick', now: NOW + 60 * DAY });
    expect(reclaimable(later).dormantProjects).toBe(3);
  });

  it('falls back to artifact activity when git knows nothing', () => {
    const folder = project('plain', undefined, { kind: 'folder' });
    const state = add(
      initialState({ now: NOW, floor: 0 }),
      entry('/r/plain/a', MB, folder),
      entry('/r/o/a', MB, BUSY),
    );
    expect(reclaimable(state).dormantProjects).toBe(1); // artifact untouched for 100 days
    expect(buildListing(state, NOW).groups).toHaveLength(2);
  });
});

describe('keymap', () => {
  it('reads keys against the current phase, even when they arrive back to back', () => {
    // "/mid" typed in one burst must filter, not select-all ('a'), sort ('s') or view ('v').
    let state = fixture();
    for (const input of ['/', 'm', 'i', 'd']) state = press(state, input);
    expect(state).toMatchObject({ phase: 'filter', filter: 'mid' });
    expect(state.selected.size).toBe(0);
  });

  it('opens and closes help, and quits', () => {
    const help = press(fixture(), '?');
    expect(help.phase).toBe('help');
    expect(press(help, 'x')).toBe(help);
    expect(press(help, '', { escape: true }).phase).toBe('browse');
    expect(press(fixture(), 'q').quit).toBe(true);
    expect(press(fixture(), 'x')).toStrictEqual(fixture());
  });

  it('edits the filter', () => {
    const typing = press(press(fixture(), '/'), 'o');
    expect(typing.filter).toBe('o');
    expect(press(typing, '', { backspace: true }).filter).toBe('');
    expect(press(typing, '', { enter: true }).phase).toBe('browse');
    expect(press(typing, 'c', { ctrl: true })).toBe(typing);
    expect(press(typing, '', { down: true })).toBeDefined();
    expect(press(typing, '', { up: true })).toBeDefined();
    expect(press(press(fixture(), 'o'), '', { escape: true }).filter).toBe('');
    expect(press(fixture(), '', { right: true })).toBeDefined();
    expect(press(fixture(), '', { left: true })).toBeDefined();
    expect(press(fixture(), '', { pageDown: true })).toBeDefined();
    expect(press(fixture(), '', { pageUp: true })).toBeDefined();
    expect(press(fixture(), '', { home: true })).toBeDefined();
    expect(press(fixture(), '', { end: true })).toBeDefined();
    expect(press(fixture(), '', { down: true })).toBeDefined();
  });
});

describe('deleting', () => {
  it('will not ask to confirm with nothing selected', () => {
    const state = press(fixture(), '', { enter: true });
    expect(state.phase).toBe('browse');
    expect(state.notice).toMatch(/Nothing selected/);
  });

  it('only deletes on y, and can be cancelled', () => {
    const asking = press(press(fixture(), 'R'), '', { enter: true });
    expect(asking.phase).toBe('confirm');
    expect(press(asking, '', { enter: true }).phase).toBe('confirm');
    expect(press(asking, 'n').phase).toBe('browse');
    expect(press(asking, '', { escape: true }).phase).toBe('browse');
    expect(press(asking, 'y').phase).toBe('cleaning');
    expect(press(press(asking, 'y'), 'q').phase).toBe('cleaning');
  });

  it('walks confirm → cleaning → done, then back to a list without what was deleted', () => {
    let state = press(press(fixture(), 'R'), '', { enter: true });
    state = apply(
      state,
      { type: 'clean-start' },
      { type: 'clean', event: { type: 'start', path: '/r/old/dist' } },
      {
        type: 'clean',
        event: { type: 'deleted', path: '/r/old/dist', bytes: 20 * MB, dryRun: false },
      },
      {
        type: 'clean',
        event: {
          type: 'refused',
          path: '/r/mid/node_modules',
          refusal: { code: 'recently-active', message: 'busy' },
        },
      },
      { type: 'clean', event: { type: 'failed', path: '/r/old/node_modules', message: 'EBUSY' } },
      { type: 'clean', event: { type: 'warning', message: 'history' } },
      {
        type: 'clean',
        event: {
          type: 'done',
          summary: { deleted: 1, refused: 1, failed: 1, bytes: 20 * MB, dryRun: false },
        },
      },
    );
    expect(state).toMatchObject({
      phase: 'done',
      freedBytes: 20 * MB,
      freedCount: 1,
      cleaning: { handled: 3, current: '/r/old/dist' },
      refused: [{ path: '/r/mid/node_modules', message: 'busy' }],
      failed: [{ path: '/r/old/node_modules', message: 'EBUSY' }],
    });
    expect(press(state, 'z')).toBe(state);

    const back = press(state, 'b');
    expect(back.phase).toBe('browse');
    expect(back.entries.map((e) => e.path).toSorted()).toEqual([
      '/r/busy/node_modules',
      '/r/mid/node_modules',
      '/r/old/node_modules',
    ]);
    expect(back.selected.size).toBe(0);
    expect(press(state, '', { enter: true }).phase).toBe('browse');
    expect(press(state, 'q').quit).toBe(true);
  });
});

describe('scan events', () => {
  it('tracks progress and the final summary', () => {
    const summary = {
      found: 2,
      entries: 1,
      protected: 0,
      dropped: { empty: 1, 'too-small': 0, 'too-recent': 0, 'active-project': 0, unreadable: 0 },
      unreadable: 0,
      bytes: 5,
      durationMs: 1,
    };
    const state = apply(
      initialState({ now: NOW }),
      { type: 'scan', event: { type: 'found', path: '/a' } },
      { type: 'scan', event: { type: 'found', path: '/b' } },
      { type: 'scan', event: { type: 'dropped', path: '/b', reason: 'empty' } },
      { type: 'scan', event: { type: 'entry', entry: entry('/a', 5, OLD) } },
      { type: 'scan', event: { type: 'done', summary } },
    );
    expect(state).toMatchObject({ found: 2, settled: 2, summary });
  });
});
