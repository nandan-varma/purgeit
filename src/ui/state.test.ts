import { describe, expect, it } from 'vitest';
import type { ScanEntry } from '../scan/scanner.js';
import { initialState, reducer, sortedEntries } from './state.js';

function entry(overrides: Partial<ScanEntry>): ScanEntry {
  return {
    path: '/root/node_modules',
    project: 'root',
    kind: 'always-safe',
    ruleName: 'node_modules',
    size: 0,
    ...overrides,
  };
}

describe('sortedEntries', () => {
  const big = entry({ path: '/root/a/node_modules', size: 1000 });
  const small = entry({ path: '/root/b/dist', size: 10 });
  const unresolved = entry({ path: '/root/c/build', size: null });

  it('sorts by size descending by default', () => {
    const state = { entries: [small, big], sortKey: 'size' as const, sortDir: 'desc' as const };
    expect(sortedEntries(state).map((e) => e.path)).toEqual([big.path, small.path]);
  });

  it('sorts by size ascending', () => {
    const state = { entries: [big, small], sortKey: 'size' as const, sortDir: 'asc' as const };
    expect(sortedEntries(state).map((e) => e.path)).toEqual([small.path, big.path]);
  });

  it('treats a null (unresolved) size as 0', () => {
    const state = { entries: [big, unresolved], sortKey: 'size' as const, sortDir: 'asc' as const };
    expect(sortedEntries(state).map((e) => e.path)).toEqual([unresolved.path, big.path]);
  });

  it('sorts by name', () => {
    const a = entry({ path: '/root/zeta/node_modules' });
    const b = entry({ path: '/root/alpha/dist' });
    const state = { entries: [a, b], sortKey: 'name' as const, sortDir: 'asc' as const };
    expect(sortedEntries(state).map((e) => e.path)).toEqual([b.path, a.path]);
  });

  it('sorts by path', () => {
    const a = entry({ path: '/root/z' });
    const b = entry({ path: '/root/a' });
    const state = { entries: [a, b], sortKey: 'path' as const, sortDir: 'asc' as const };
    expect(sortedEntries(state).map((e) => e.path)).toEqual([b.path, a.path]);
  });

  it('does not mutate the input array', () => {
    const entries = [small, big];
    sortedEntries({ entries, sortKey: 'size', sortDir: 'desc' });
    expect(entries).toEqual([small, big]);
  });
});

describe('reducer TOGGLE_SELECT', () => {
  it('toggles the entry at the cursor position in sorted (displayed) order, not discovery order', () => {
    const big = entry({ path: '/root/a/node_modules', size: 1000 });
    const small = entry({ path: '/root/b/dist', size: 10 });
    // Discovery order is [small, big], but default sort is size-descending,
    // so the row visually at cursor 0 is `big`, not `small`.
    const state = {
      ...initialState(),
      phase: 'ready' as const,
      entries: [small, big],
      cursor: 0,
    };
    const next = reducer(state, { type: 'TOGGLE_SELECT' });
    expect(next.selected.has(big.path)).toBe(true);
    expect(next.selected.has(small.path)).toBe(false);
  });

  it('is a no-op when the cursor is out of range (e.g. empty entries)', () => {
    const state = { ...initialState(), phase: 'ready' as const, entries: [], cursor: 0 };
    const next = reducer(state, { type: 'TOGGLE_SELECT' });
    expect(next).toBe(state);
  });
});

describe('reducer SCAN_DONE', () => {
  it('carries through the warnings collected during the scan', () => {
    const state = { ...initialState(), entries: [entry({})] };
    const warnings = [{ file: 'package.json', message: 'missing name field' }];
    const next = reducer(state, { type: 'SCAN_DONE', warnings });
    expect(next.warnings).toEqual(warnings);
    expect(next.phase).toBe('ready');
  });
});
