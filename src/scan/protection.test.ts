import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { findProtection, probeTracked } from './protection.js';

/** Turns `root` into a git repository and commits `paths` (relative to root). */
function commit(root: string, paths: readonly string[]): void {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
  git('init', '-q');
  git('add', '--', ...paths);
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture');
}

describe('findProtection', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('protects a directory holding its own .git (file or directory)', async () => {
    root = buildTree({ vendor: { lib: { '.git': 'gitdir: ../x' } }, build: { '.git': {} } });
    expect(await findProtection(join(root, 'vendor'))).toBe('nested-repository');
    expect(await findProtection(join(root, 'build'))).toBe('nested-repository');
  });

  it("protects Anchor's target/deploy/*-keypair.json", async () => {
    root = buildTree({ target: { deploy: { 'program-keypair.json': '[1,2,3]' } } });
    expect(await findProtection(join(root, 'target'))).toBe('deploy-keypair');
  });

  it('only looks three levels deep for content markers', async () => {
    root = buildTree({ dist: { a: { b: { c: { '.git': {} } } } } });
    expect(await findProtection(join(root, 'dist'))).toBeUndefined();
  });

  it('protects a directory with git-tracked files, not an ignored one', async () => {
    root = buildTree({
      '.gitignore': 'node_modules\n',
      build: { 'keep.sh': 'x' },
      node_modules: { pkg: 'x' },
    });
    commit(root, ['.gitignore', 'build/keep.sh']);
    expect(await findProtection(join(root, 'build'))).toBe('tracked-files');
    expect(await findProtection(join(root, 'node_modules'))).toBeUndefined();
  });

  it('treats a directory outside any repository as unprotected', async () => {
    root = buildTree({ dist: { 'a.js': 'x' } });
    expect(await findProtection(join(root, 'dist'))).toBeUndefined();
  });

  it('treats an unreadable directory as unprotected by content (git still decides)', async () => {
    root = buildTree({});
    expect(await findProtection(join(root, 'missing'))).toBeUndefined();
  });
});

describe('probeTracked', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('reports nothing when git is not installed', async () => {
    root = buildTree({ dist: {} });
    expect(await probeTracked(join(root, 'dist'), 'purgeit-no-such-git-binary')).toBeUndefined();
  });

  it('reports unverified when git fails for a reason other than "not a repository"', async () => {
    root = buildTree({ dist: {} });
    expect(await probeTracked(join(root, 'dist'), 'false')).toBe('unverified');
  });

  it('ignores inherited GIT_DIR routing and inspects the directory’s own repository', async () => {
    root = buildTree({ build: { 'keep.sh': 'x' } });
    commit(root, ['build/keep.sh']);
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = '/nonexistent/.git';
    try {
      expect(await probeTracked(join(root, 'build'))).toBe('tracked-files');
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
  });
});
