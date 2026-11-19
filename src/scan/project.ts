import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { errorCode } from '../errors.js';
import { isSkippable, listDir } from '../fs/io.js';

/** Entries whose presence marks a directory as a project when no git repository encloses it. */
export const PROJECT_MANIFESTS: ReadonlySet<string> = new Set([
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

/**
 * What an artifact belongs to. Worktrees are folded into the repository they
 * were created from, so one project is one row however many checkouts it has.
 */
export interface ProjectRef {
  /** The directory that defines the project (repo root, worktree root, or manifest folder). */
  readonly root: string;
  readonly kind: 'repo' | 'worktree' | 'folder';
  /** Grouping key: the main repository for a worktree, otherwise `root`. */
  readonly group: string;
  /** When someone last worked in it (epoch ms), from git's own log; undefined when unknown. */
  readonly touchedAt: number | undefined;
}

export const projectName = (project: Pick<ProjectRef, 'group'>): string => basename(project.group);

/** A project that has been recognized but not yet resolved (resolution reads files). */
export type ProjectSeed = { readonly root: string; readonly kind: 'repo' | 'worktree' | 'folder' };

/**
 * Recognizes a project root from a directory's listing: a `.git` directory is
 * a repository, a `.git` file is a worktree (or submodule), and otherwise a
 * manifest marks a plain folder — but only outside any enclosing project.
 */
export function recognizeProject(
  dir: string,
  children: Awaited<ReturnType<typeof listDir>>,
  enclosed: boolean,
): ProjectSeed | undefined {
  const git = children.find((child) => child.name === '.git');
  if (git !== undefined) return { root: dir, kind: git.isDirectory() ? 'repo' : 'worktree' };
  if (!enclosed && children.some((child) => PROJECT_MANIFESTS.has(child.name))) {
    return { root: dir, kind: 'folder' };
  }
  return undefined;
}

async function mtime(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

/** Where the git directory of a worktree or submodule lives, from its `.git` file. */
async function gitDirOf(root: string): Promise<string | undefined> {
  const text = await readFile(join(root, '.git'), 'utf8').catch(() => undefined);
  const target = /^gitdir:\s*(.+)$/m.exec(text ?? '')?.[1]?.trim();
  return target === undefined ? undefined : resolve(root, target);
}

/**
 * Reads what a seed needs to become a full `ProjectRef`. The activity signal
 * is the mtime of git's HEAD log — it moves on commit, checkout and pull, but
 * not on `git status`, and costs one `stat`.
 */
export async function resolveProject(seed: ProjectSeed): Promise<ProjectRef> {
  if (seed.kind === 'folder') {
    return { ...seed, group: seed.root, touchedAt: undefined };
  }
  if (seed.kind === 'repo') {
    return {
      ...seed,
      group: seed.root,
      touchedAt: await mtime(join(seed.root, '.git', 'logs', 'HEAD')),
    };
  }
  const gitDir = await gitDirOf(seed.root);
  // <repo>/.git/worktrees/<name> → <repo>; submodules (.git/modules/…) are their own repos.
  const isWorktree = gitDir !== undefined && basename(dirname(gitDir)) === 'worktrees';
  return {
    root: seed.root,
    kind: isWorktree ? 'worktree' : 'repo',
    group: isWorktree ? dirname(dirname(dirname(gitDir))) : seed.root,
    touchedAt: gitDir === undefined ? undefined : await mtime(join(gitDir, 'logs', 'HEAD')),
  };
}

/**
 * The project a directory belongs to, found by climbing from its parent: the
 * nearest enclosing git repository or worktree, else the nearest manifest folder.
 */
export async function findProject(path: string): Promise<ProjectRef | undefined> {
  let folder: ProjectSeed | undefined;
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    const children = await listDir(dir).catch((error: unknown) => {
      if (isSkippable(error)) return [];
      throw error;
    });
    const seed = recognizeProject(dir, children, false);
    if (seed !== undefined) {
      if (seed.kind !== 'folder') return resolveProject(seed);
      folder ??= seed;
    }
    if (dirname(dir) === dir) break;
  }
  return folder === undefined ? undefined : resolveProject(folder);
}
