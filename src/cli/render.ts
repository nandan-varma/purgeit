import { homedir } from 'node:os';
import { styleText } from 'node:util';

import { PROTECTION_LABELS } from '../fs/protection.js';
import { activityOf, isDormant, type ProjectGroup } from '../scan/projects.js';
import type { Entry, ScanSummary } from '../scan/scan.js';
import { formatAge, formatSize } from '../units.js';

/** `/Users/me/dev/app` → `~/dev/app`. */
export function tildify(path: string, home = homedir()): string {
  return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

const pad = (text: string, width: number): string => text.padEnd(width);
const padStart = (text: string, width: number): string => text.padStart(width);

/** A scan as an aligned table: deletable entries largest first, then the protected ones. */
export function renderEntries(entries: readonly Entry[], now: number, home?: string): string {
  if (entries.length === 0) return '';
  const rows = entries.map((entry) => ({
    entry,
    size: formatSize(entry.bytes),
    age: formatAge(now - entry.lastActive),
    rule: entry.rule.name,
    path: tildify(entry.path, home),
  }));
  const width = (pick: (row: (typeof rows)[number]) => string, header: string): number =>
    Math.max(header.length, ...rows.map((row) => pick(row).length));
  const [wSize, wAge, wRule] = [
    width((r) => r.size, 'SIZE'),
    width((r) => r.age, 'AGE'),
    width((r) => r.rule, 'RULE'),
  ] as const;

  const header = styleText(
    'dim',
    `${padStart('SIZE', wSize)}  ${pad('AGE', wAge)}  ${pad('RULE', wRule)}  PATH`,
  );
  const lines = rows.map(({ entry, size, age, rule, path }) => {
    const line = `${padStart(size, wSize)}  ${pad(age, wAge)}  ${pad(rule, wRule)}  ${path}`;
    return entry.protection === undefined
      ? line
      : styleText('dim', `${line}  (protected: ${PROTECTION_LABELS[entry.protection]})`);
  });
  return [header, ...lines].join('\n');
}

const ECOSYSTEM_NAMES: Readonly<Record<string, string>> = {
  'javascript-typescript': 'JS/TS',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  apple: 'Apple',
  'java-jvm': 'JVM',
  dotnet: '.NET',
  'dart-flutter': 'Dart',
  cpp: 'C/C++',
  'cache-marker': 'caches',
};

const ecosystemList = (group: ProjectGroup): string =>
  group.ecosystems
    .filter((id) => id !== 'vcs')
    .map((id) => ECOSYSTEM_NAMES[id] ?? id)
    .join(' · ');

/**
 * A scan rolled up per project, dormant and largest first. Activity is git's
 * signal when it has one, otherwise the newest change inside the artifacts.
 */
export function renderProjects(
  groups: readonly ProjectGroup[],
  now: number,
  dormantAfter: number,
): string {
  if (groups.length === 0) return '';
  const rows = groups.map((group) => ({
    name: `${group.name}${group.worktrees > 0 ? ` (+${group.worktrees} worktree${group.worktrees === 1 ? '' : 's'})` : ''}`,
    size: formatSize(group.bytes),
    items: String(group.artifacts),
    active: formatAge(now - activityOf(group)),
    dormant: isDormant(group, now, dormantAfter),
    eco: ecosystemList(group),
  }));
  const w = (pick: (row: (typeof rows)[number]) => string, header: string): number =>
    Math.max(header.length, ...rows.map((row) => pick(row).length));
  const [wName, wSize, wItems, wActive] = [
    w((r) => r.name, 'PROJECT'),
    w((r) => r.size, 'SIZE'),
    w((r) => r.items, 'ITEMS'),
    w((r) => r.active, 'ACTIVE'),
  ] as const;
  const header = styleText(
    'dim',
    `${pad('PROJECT', wName)}  ${padStart('SIZE', wSize)}  ${padStart('ITEMS', wItems)}  ${padStart('ACTIVE', wActive)}  ECOSYSTEMS`,
  );
  const lines = rows.map(
    (row) =>
      `${pad(row.name, wName)}  ${padStart(row.size, wSize)}  ${padStart(row.items, wItems)}  ${styleText(row.dormant ? 'green' : 'reset', padStart(row.active, wActive))}  ${styleText('dim', row.eco)}`,
  );
  return [header, ...lines].join('\n');
}

export function renderSummary(summary: ScanSummary, roots: number): string {
  const seconds = (summary.durationMs / 1000).toFixed(1);
  const parts = [
    `${summary.entries} artifact${summary.entries === 1 ? '' : 's'}`,
    `${formatSize(summary.bytes)} reclaimable`,
  ];
  if (summary.protected > 0) parts.push(`${summary.protected} protected`);
  const head = `${parts.join(' · ')} — scanned ${roots} root${roots === 1 ? '' : 's'} in ${seconds}s`;
  const notes: string[] = [];
  if (summary.unreadable > 0)
    notes.push(
      `${summary.unreadable} director${summary.unreadable === 1 ? 'y' : 'ies'} could not be read`,
    );
  const hidden = Object.values(summary.dropped).reduce((sum, count) => sum + count, 0);
  if (hidden > 0) notes.push(`${hidden} hidden by filters`);
  return notes.length === 0 ? head : `${head}\n${styleText('dim', notes.join(' · '))}`;
}
