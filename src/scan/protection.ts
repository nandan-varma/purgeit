import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { globToRegExp } from '../rules/gate-context.js';

/**
 * Why a directory that matched a rule by name must still not be deleted:
 * a name never proves content is regenerable.
 * - `nested-repository` — it contains its own `.git` (a checkout, not output)
 * - `deploy-keypair` — it holds a `*-keypair.json` (e.g. Anchor's
 *   `target/deploy/<program>-keypair.json`, a program's on-chain identity)
 * - `tracked-files` — git tracks files inside it (committed, authored content)
 * - `unverified` — the git probe failed for a reason other than "not a repo",
 *   so nothing proves it safe
 */
export type ProtectionReason =
  | 'nested-repository'
  | 'deploy-keypair'
  | 'tracked-files'
  | 'unverified';

export const PROTECTION_DESCRIPTIONS: Readonly<Record<ProtectionReason, string>> = {
  'nested-repository': 'contains its own .git repository',
  'deploy-keypair': 'contains a *-keypair.json deploy key',
  'tracked-files': 'contains files tracked by git',
  unverified: 'could not verify it holds no git-tracked files',
};

/** How far below the artifact to look for `.git` / keypairs (Anchor's keypair sits at depth 2). */
const CONTENT_PROBE_DEPTH = 3;
const KEYPAIR = globToRegExp('*-keypair.json');

/** Git's "not a git repository" exit status. */
const GIT_NOT_A_REPO = 128;

/**
 * Returns why `path` is protected, or undefined when nothing marks it as
 * authored. Content markers are checked first (bounded, never following
 * symlinks), then git is asked whether it tracks anything inside `path`.
 */
export async function findProtection(path: string): Promise<ProtectionReason | undefined> {
  return (await probeContent(path, 1)) ?? (await probeTracked(path));
}

async function probeContent(dir: string, depth: number): Promise<ProtectionReason | undefined> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (entry.name === '.git') return 'nested-repository';
    if (entry.isFile() && KEYPAIR.test(entry.name)) return 'deploy-keypair';
  }
  if (depth >= CONTENT_PROBE_DEPTH) return undefined;
  const subdirs = entries.filter((e) => e.isDirectory() && !e.isSymbolicLink());
  const verdicts = await Promise.all(
    subdirs.map((e) => probeContent(join(dir, e.name), depth + 1)),
  );
  return verdicts.find((verdict) => verdict !== undefined);
}

/**
 * Asks git (in whatever repository encloses `path`) whether it tracks any file
 * under `path`, stopping at the first line of output. Inherited GIT_DIR-style
 * routing is dropped so git inspects `path`'s own repository. A missing git
 * binary or "not a repository" means nothing is tracked; any other failure is
 * `unverified`, since absence of evidence isn't proof of safety.
 */
export function probeTracked(path: string, git = 'git'): Promise<ProtectionReason | undefined> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_LITERAL_PATHSPECS: '1',
  };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'])
    delete env[key];

  return new Promise((resolve) => {
    const child = spawn(
      git,
      ['-c', 'core.fsmonitor=false', '-C', path, 'ls-files', '-z', '--', '.'],
      {
        env,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    let tracked = false;
    child.stdout.once('data', () => {
      tracked = true;
      child.kill();
    });
    child.once('error', () => resolve(undefined));
    child.once('close', (code) => {
      if (tracked) resolve('tracked-files');
      else if (code === 0 || code === GIT_NOT_A_REPO) resolve(undefined);
      else resolve('unverified');
    });
  });
}
