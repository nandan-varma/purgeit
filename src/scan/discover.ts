import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createIo, type Io, isSkippable } from '../fs/io.js';
import type { RuleSet } from '../rules/rule-set.js';
import { HOME_SKIPPED } from './scan.js';

/**
 * Conventional project folders under home, plus the containers AI coding
 * agents keep their worktrees in (dot directories, which container discovery
 * never enters, so they are listed explicitly).
 */
const WELL_KNOWN_ROOTS: readonly string[] = [
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

/** Entries whose presence marks a directory as a project. */
const PROJECT_INDICATORS: ReadonlySet<string> = new Set([
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
]);

/** How deep below a home folder to look for a project before calling it something else. */
const PROBE_DEPTH = 2;

async function list(io: Io, dir: string) {
  try {
    return await io.readdir(dir);
  } catch (error) {
    if (isSkippable(error)) return [];
    throw error;
  }
}

async function holdsProject(io: Io, dir: string, depth: number): Promise<boolean> {
  const subdirs = (await list(io, dir)).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('.'),
  );
  const listings = await Promise.all(subdirs.map((sub) => list(io, join(dir, sub.name))));
  if (listings.some((names) => names.some((entry) => PROJECT_INDICATORS.has(entry.name)))) {
    return true;
  }
  if (depth >= PROBE_DEPTH) return false;
  const deeper = await Promise.all(
    subdirs.map((sub) => holdsProject(io, join(dir, sub.name), depth + 1)),
  );
  return deeper.some(Boolean);
}

export interface DiscoverOptions {
  readonly home?: string;
  readonly io?: Io;
}

/**
 * Finds where this machine keeps projects: every well-known root that exists,
 * plus any other visible home folder holding a project within two levels.
 * Never returns system folders, nor a home folder that is itself an artifact
 * (a stray ~/node_modules would look like a folder full of projects).
 */
export async function discoverRoots(
  rules: RuleSet,
  options: DiscoverOptions = {},
): Promise<string[]> {
  const home = options.home ?? homedir();
  const io = options.io ?? createIo();

  const known = await Promise.all(
    WELL_KNOWN_ROOTS.map(async (name) => {
      const path = join(home, name);
      const isDirectory = await stat(path).then(
        (stats) => stats.isDirectory(),
        () => false,
      );
      return isDirectory ? path : undefined;
    }),
  );

  const knownTopLevel = new Set(WELL_KNOWN_ROOTS.map((name) => name.split(/[\\/]/)[0]));
  const candidates = (await list(io, home)).filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      !HOME_SKIPPED.has(entry.name) &&
      !knownTopLevel.has(entry.name) &&
      !rules.named.has(entry.name),
  );
  const containers = await Promise.all(
    candidates.map(async (entry) =>
      (await holdsProject(io, join(home, entry.name), 1)) ? join(home, entry.name) : undefined,
    ),
  );

  return [...known, ...containers].filter((root): root is string => root !== undefined);
}
