import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedRuleSet } from '../types.js';
import { HOME_PRUNE_NAMES } from './walk.js';

/**
 * Conventional project folders under the home directory, plus the containers
 * AI coding agents keep their worktrees in — those sit under dot directories,
 * which container discovery below never enters, so they're listed explicitly.
 * The worktrees themselves are projects to scan, never deletion candidates.
 */
export const WELL_KNOWN_ROOTS: readonly string[] = [
  'www',
  'dev',
  'Projects',
  'GitHub',
  'Code',
  'Workspace',
  'Repos',
  'Development',
  join('Library', 'CloudStorage'),
  join('.codex', 'worktrees'),
  join('.claude', 'worktrees'),
];

/** Files or directories whose presence marks a project root. */
export const PROJECT_INDICATORS: readonly string[] = [
  '.git',
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  'composer.json',
  'pubspec.yaml',
  'Package.swift',
  'Makefile',
  'build.zig',
  'terragrunt.hcl',
];

/** How deep below a home-level folder to look for a project before calling it a container. */
const CONTAINER_PROBE_DEPTH = 2;

/**
 * Finds the directories `--discover` scans: every well-known root that exists,
 * plus any other non-hidden directory directly under `home` holding a project
 * within two levels. Never returns ~/Library, ~/.Trash, ~/Applications, or a
 * home-level directory that is itself an artifact (a stray ~/node_modules
 * would otherwise look like a folder full of package.json "projects").
 */
export async function discoverRoots(
  ruleSet: ResolvedRuleSet,
  home: string = homedir(),
): Promise<string[]> {
  const known = await Promise.all(
    WELL_KNOWN_ROOTS.map(async (name) =>
      (await isDirectory(join(home, name))) ? join(home, name) : undefined,
    ),
  );
  const knownRoots = known.filter((root): root is string => root !== undefined);

  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(home, { withFileTypes: true });
  } catch {
    return knownRoots;
  }
  const knownTopLevel = new Set(WELL_KNOWN_ROOTS.map((name) => name.split(/[\\/]/)[0]));
  const candidates = entries.filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      !HOME_PRUNE_NAMES.has(entry.name) &&
      !knownTopLevel.has(entry.name) &&
      !ruleSet.alwaysSafe.has(entry.name) &&
      !ruleSet.gated.has(entry.name),
  );
  const containers = await Promise.all(
    candidates.map(async ({ name }) =>
      (await holdsProject(join(home, name), 1)) ? join(home, name) : undefined,
    ),
  );
  return [...knownRoots, ...containers.filter((root): root is string => root !== undefined)];
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}

async function holdsProject(dir: string, depth: number): Promise<boolean> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  const subdirs = entries.filter(
    (e) => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.'),
  );
  for (const sub of subdirs) {
    const names = await readdir(join(dir, sub.name)).catch(() => [] as string[]);
    if (names.some((name) => PROJECT_INDICATORS.includes(name))) return true;
  }
  if (depth >= CONTAINER_PROBE_DEPTH) return false;
  for (const sub of subdirs) {
    if (await holdsProject(join(dir, sub.name), depth + 1)) return true;
  }
  return false;
}
