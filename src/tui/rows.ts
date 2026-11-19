import { PROTECTION_LABELS } from '../fs/protection.js';
import { activityOf, compareGroups, groupProjects, type ProjectGroup } from '../scan/projects.js';
import type { Entry } from '../scan/scan.js';

export type SortKey = 'smart' | 'size' | 'age' | 'name';

/** What `s` cycles through, with the label shown in the header. */
export const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  smart: 'dormant first',
  size: 'size',
  age: 'oldest first',
  name: 'name',
};

export type View = 'projects' | 'artifacts';

/** The slice of UI state that decides what is listed. */
export interface ListState {
  readonly entries: readonly Entry[];
  readonly filter: string;
  readonly sortKey: SortKey;
  readonly reversed: boolean;
  readonly view: View;
  readonly expanded: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  /** Artifacts smaller than this are hidden unless `showSmall`. */
  readonly floor: number;
  readonly showSmall: boolean;
  /** A project untouched for this long is dormant. */
  readonly dormantMs: number;
}

export type Row =
  | {
      readonly type: 'project';
      readonly id: string;
      readonly group: ProjectGroup;
      readonly expanded: boolean;
      readonly dormant: boolean;
      /** How much of the project's deletable artifacts is selected. */
      readonly selection: 'all' | 'some' | 'none';
    }
  | {
      readonly type: 'artifact';
      readonly id: string;
      readonly entry: Entry;
      /** Shown under its project row. */
      readonly nested: boolean;
    };

export interface Listing {
  readonly rows: readonly Row[];
  readonly groups: readonly ProjectGroup[];
  /** Artifacts held back by the size floor. */
  readonly hidden: { readonly count: number; readonly bytes: number };
  /** The view actually shown: a single project is listed flat. */
  readonly view: View;
}

const projectRowId = (key: string): string => `p:${key}`;
const artifactRowId = (path: string): string => `a:${path}`;

export const isDeletable = (entry: Entry): boolean => entry.protection === undefined;

const matches = (entry: Entry, needle: string): boolean =>
  entry.path.toLowerCase().includes(needle) ||
  entry.rule.name.toLowerCase().includes(needle) ||
  entry.project.group.toLowerCase().includes(needle);

/** The filter needle, lowered; empty when the list is not filtered. */
const needleOf = (state: ListState): string => state.filter.trim().toLowerCase();

/** Entries that survive the filter and the size floor. */
export function listedEntries(state: ListState): Entry[] {
  const needle = needleOf(state);
  return state.entries.filter(
    (entry) =>
      (state.showSmall || entry.bytes >= state.floor) && (needle === '' || matches(entry, needle)),
  );
}

const byBytes = (a: Entry, b: Entry): number =>
  Number(!isDeletable(a)) - Number(!isDeletable(b)) ||
  b.bytes - a.bytes ||
  a.path.localeCompare(b.path);

function groupComparator(state: ListState, now: number) {
  switch (state.sortKey) {
    case 'smart':
      return compareGroups(now, state.dormantMs);
    case 'size':
      return (a: ProjectGroup, b: ProjectGroup) =>
        b.bytes - a.bytes || a.name.localeCompare(b.name);
    case 'age':
      return (a: ProjectGroup, b: ProjectGroup) =>
        activityOf(a) - activityOf(b) || b.bytes - a.bytes;
    case 'name':
      return (a: ProjectGroup, b: ProjectGroup) => a.name.localeCompare(b.name);
  }
}

function selectionOf(group: ProjectGroup, selected: ReadonlySet<string>): 'all' | 'some' | 'none' {
  const deletable = group.entries.filter(isDeletable);
  const chosen = deletable.filter((entry) => selected.has(entry.path)).length;
  return chosen === 0 ? 'none' : chosen === deletable.length ? 'all' : 'some';
}

/** Small artifacts the floor holds back — counted only when the filter would have shown them. */
function hiddenByFloor(state: ListState): { count: number; bytes: number } {
  if (state.showSmall) return { count: 0, bytes: 0 };
  const needle = needleOf(state);
  const held = state.entries.filter(
    (entry) => entry.bytes < state.floor && (needle === '' || matches(entry, needle)),
  );
  return { count: held.length, bytes: held.reduce((sum, entry) => sum + entry.bytes, 0) };
}

/**
 * Builds what the list shows. Projects are the default unit; with a single
 * project there is nothing to group, so its artifacts are listed directly.
 */
export function buildListing(state: ListState, now: number): Listing {
  const shown = listedEntries(state);
  const hidden = hiddenByFloor(state);

  const compare = groupComparator(state, now);
  const direction = state.reversed ? -1 : 1;
  const groups = groupProjects(shown).toSorted((a, b) => direction * compare(a, b));
  const view = state.view === 'projects' && groups.length > 1 ? 'projects' : 'artifacts';

  if (view === 'artifacts') {
    const order = new Map(groups.map((group, index) => [group.key, index]));
    const flat = shown.toSorted(
      (a, b) =>
        Number(!isDeletable(a)) - Number(!isDeletable(b)) ||
        direction *
          (state.sortKey === 'smart'
            ? (order.get(a.project.group) ?? 0) - (order.get(b.project.group) ?? 0) || byBytes(a, b)
            : state.sortKey === 'size'
              ? b.bytes - a.bytes
              : state.sortKey === 'age'
                ? a.lastActive - b.lastActive
                : a.path.localeCompare(b.path)) ||
        a.path.localeCompare(b.path),
    );
    return {
      rows: flat.map((entry) => ({
        type: 'artifact',
        id: artifactRowId(entry.path),
        entry,
        nested: false,
      })),
      groups,
      hidden,
      view,
    };
  }

  const rows: Row[] = [];
  for (const group of groups) {
    const expanded = state.expanded.has(group.key);
    rows.push({
      type: 'project',
      id: projectRowId(group.key),
      group,
      expanded,
      dormant: now - activityOf(group) >= state.dormantMs,
      selection: selectionOf(group, state.selected),
    });
    if (expanded) {
      for (const entry of group.entries.toSorted(byBytes)) {
        rows.push({ type: 'artifact', id: artifactRowId(entry.path), entry, nested: true });
      }
    }
  }
  return { rows, groups, hidden, view };
}

/** Why a protected artifact can't be selected, for the notice line. */
export const protectedNotice = (entry: Entry): string =>
  entry.protection === undefined
    ? ''
    : `Protected — ${PROTECTION_LABELS[entry.protection]}; it can never be selected.`;
