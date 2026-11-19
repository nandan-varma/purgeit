import { projectName } from './project.js';
import type { Entry } from './scan.js';

/** How long a project must be untouched before it counts as dormant. */
export const DEFAULT_DORMANT_MS = 30 * 24 * 60 * 60 * 1000;

/** Everything one project (a repository with all its worktrees, or a folder) holds. */
export interface ProjectGroup {
  /** The main repository (or folder) path that identifies the group. */
  readonly key: string;
  readonly name: string;
  readonly entries: readonly Entry[];
  /** Worktrees folded into it, besides the main checkout. */
  readonly worktrees: number;
  /** Bytes in deletable entries. */
  readonly bytes: number;
  /** Deletable entries. */
  readonly artifacts: number;
  readonly protected: number;
  /** Ecosystem ids of the rules that matched. */
  readonly ecosystems: readonly string[];
  /** Newest git activity across the group, if git knows. */
  readonly touchedAt: number | undefined;
  /** Newest modification inside any artifact. */
  readonly lastActive: number;
}

/**
 * When the project was last worked on: git's own signal when it has one,
 * otherwise the newest change inside its artifacts.
 */
export const activityOf = (group: Pick<ProjectGroup, 'touchedAt' | 'lastActive'>): number =>
  group.touchedAt ?? group.lastActive;

export const isDormant = (
  group: Pick<ProjectGroup, 'touchedAt' | 'lastActive'>,
  now: number,
  threshold = DEFAULT_DORMANT_MS,
): boolean => now - activityOf(group) >= threshold;

const newest = (values: readonly (number | undefined)[]): number | undefined =>
  values.reduce<number | undefined>(
    (best, value) => (value === undefined || (best !== undefined && best >= value) ? best : value),
    undefined,
  );

/** Folds entries into projects. Order is first-seen; sort with `compareGroups`. */
export function groupProjects(entries: readonly Entry[]): ProjectGroup[] {
  const byKey = new Map<string, Entry[]>();
  for (const entry of entries) {
    const members = byKey.get(entry.project.group);
    if (members === undefined) byKey.set(entry.project.group, [entry]);
    else members.push(entry);
  }
  return [...byKey].map(([key, members]) => {
    const deletable = members.filter((entry) => entry.protection === undefined);
    const roots = new Set(members.map((entry) => entry.project.root));
    return {
      key,
      name: projectName({ group: key }),
      entries: members,
      worktrees: members.some((entry) => entry.project.kind === 'worktree')
        ? [...roots].filter((root) => root !== key).length
        : 0,
      bytes: deletable.reduce((sum, entry) => sum + entry.bytes, 0),
      artifacts: deletable.length,
      protected: members.length - deletable.length,
      ecosystems: [...new Set(members.flatMap((entry) => entry.rule.categories))],
      touchedAt: newest(members.map((entry) => entry.project.touchedAt)),
      lastActive: newest(members.map((entry) => entry.lastActive)) ?? 0,
    };
  });
}

/** Dormant projects first, then by reclaimable size — what is both stale and big leads. */
export const compareGroups =
  (now: number, threshold = DEFAULT_DORMANT_MS) =>
  (a: ProjectGroup, b: ProjectGroup): number =>
    Number(isDormant(b, now, threshold)) - Number(isDormant(a, now, threshold)) ||
    b.bytes - a.bytes ||
    a.name.localeCompare(b.name);
