import { spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';

import picomatch from 'picomatch';

import { isSkippable, listDir } from './io.js';

/**
 * Why a directory that a rule matched by name must still not be deleted — a
 * name never proves that what is inside is regenerable.
 */
export type ProtectionReason =
  'nested-repository' | 'deploy-keypair' | 'tracked-files' | 'unverified';

export const PROTECTION_LABELS: Readonly<Record<ProtectionReason, string>> = {
  'nested-repository': 'contains its own .git repository',
  'deploy-keypair': 'contains a *-keypair.json deploy key',
  'tracked-files': 'contains files tracked by git',
  unverified: 'could not verify it holds no git-tracked files',
};

/** Anchor's `target/deploy/<program>-keypair.json` sits two levels down. */
const PROBE_DEPTH = 3;
const isKeypair = picomatch('*-keypair.json');
const GIT_NOT_A_REPOSITORY = 128;

/**
 * Returns why `path` is protected, or undefined when nothing marks it as
 * authored. Content markers are checked first (bounded, symlinks never
 * followed), then git is asked whether it tracks anything inside `path`.
 */
export async function findProtection(path: string): Promise<ProtectionReason | undefined> {
  return (await probeContent(path, 1)) ?? (await probeTracked(path));
}

async function probeContent(dir: string, depth: number): Promise<ProtectionReason | undefined> {
  let entries: Awaited<ReturnType<typeof listDir>>;
  try {
    entries = await listDir(dir);
  } catch (error) {
    if (isSkippable(error)) return undefined;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === '.git') return 'nested-repository';
    if (entry.isFile() && isKeypair(entry.name)) return 'deploy-keypair';
  }
  if (depth >= PROBE_DEPTH) return undefined;
  const verdicts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => probeContent(join(dir, entry.name), depth + 1)),
  );
  return verdicts.find((verdict) => verdict !== undefined);
}

/** The environment git runs in: no optional locks, and no inherited repository routing. */
function gitEnv(literalPathspecs: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  // `git check-ignore` rejects this setting, so it is opt-in per command.
  if (literalPathspecs) env.GIT_LITERAL_PATHSPECS = '1';
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) {
    delete env[key];
  }
  return env;
}

/**
 * Asks git, in whatever repository encloses `path`, whether it tracks any file
 * under `path`, stopping at the first line of output. Inherited GIT_DIR-style
 * routing is dropped so git inspects `path`'s own repository. A missing git
 * binary or "not a repository" means nothing is tracked; any other failure is
 * `unverified`, since absence of evidence is not proof of safety.
 */
export function probeTracked(path: string, git = 'git'): Promise<ProtectionReason | undefined> {
  const env = gitEnv(true);

  return new Promise((resolve) => {
    const child = spawn(
      git,
      ['-c', 'core.fsmonitor=false', '-C', path, 'ls-files', '-z', '--', '.'],
      { env, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let tracked = false;
    child.stdout.once('data', () => {
      tracked = true;
      child.kill();
    });
    child.once('error', () => resolve(undefined));
    child.once('close', (code) => {
      if (tracked) resolve('tracked-files');
      else if (code === 0 || code === GIT_NOT_A_REPOSITORY) resolve(undefined);
      else resolve('unverified');
    });
  });
}

/**
 * Does git consider `path` ignored? `true` is evidence that it is not authored
 * content; `false` means it is visible to git; undefined means it is not in a
 * repository (or git could not answer).
 */
export function isGitIgnored(path: string, git = 'git'): Promise<boolean | undefined> {
  return new Promise((resolve) => {
    const child = spawn(git, ['-C', dirname(path), 'check-ignore', '-q', '--', basename(path)], {
      env: gitEnv(false),
      stdio: 'ignore',
    });
    child.once('error', () => resolve(undefined));
    child.once('close', (code) => resolve(code === 0 ? true : code === 1 ? false : undefined));
  });
}
