import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { backdate, blob, buildTree, rel } from '../../test/tree.js';
import { isGitIgnored } from '../fs/protection.js';
import { createRuleSet } from '../rules/rule-set.js';
import { projectName } from './project.js';
import { activityOf, compareGroups, groupProjects, isDormant } from './projects.js';
import { scanAll } from './scan.js';
import { syncProvider } from './sync.js';

const rules = createRuleSet();
const DAY = 86_400_000;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=a@b.c', '-c', 'user.name=n', ...args], {
    stdio: 'ignore',
  });

/** A repo with a monorepo layout, a plain folder project, and a worktree. */
function workspace() {
  const root = buildTree({
    mono: {
      '.git': { logs: { HEAD: 'x' }, HEAD: 'ref' },
      packages: {
        a: { 'package.json': '{}', node_modules: { 'x.js': blob(3000) } },
        b: { 'package.json': '{}', node_modules: { 'y.js': blob(3000) } },
      },
    },
    folder: { 'Cargo.toml': '', target: { bin: blob(3000) } },
    loose: { node_modules: { 'z.js': blob(3000) } },
    wt: { '.git': 'gitdir: GITDIR', 'package.json': '{}', node_modules: { 'w.js': blob(3000) } },
  });
  // point the worktree at a gitdir that looks like <repo>/.git/worktrees/wt
  const gitDir = join(root, 'mono', '.git', 'worktrees', 'wt');
  buildTree({});
  return { root, gitDir };
}

describe('project detection', () => {
  it('treats a repository (monorepo included) as one project', async () => {
    const { root } = workspace();
    const { entries } = await scanAll([join(root, 'mono')], { rules });
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e) => e.project.root))).toEqual(new Set([join(root, 'mono')]));
    expect(entries[0]?.project.kind).toBe('repo');
    expect(groupProjects(entries)).toHaveLength(1);
  });

  it('falls back to a manifest folder outside any repository, and to the parent folder otherwise', async () => {
    const { root } = workspace();
    const { entries } = await scanAll([join(root, 'folder'), join(root, 'loose')], { rules });
    const byRule = Object.fromEntries(entries.map((e) => [e.rule.name, e.project]));
    expect(byRule.target).toMatchObject({ kind: 'folder', root: join(root, 'folder') });
    expect(byRule.node_modules).toMatchObject({ kind: 'folder', root: join(root, 'loose') });
  });

  it('folds a worktree into the repository it came from', async () => {
    const { root, gitDir } = workspace();
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(join(gitDir, 'logs'), { recursive: true });
    writeFileSync(join(gitDir, 'logs', 'HEAD'), 'x');
    writeFileSync(join(root, 'wt', '.git'), `gitdir: ${gitDir}\n`);

    const { entries } = await scanAll([join(root, 'wt'), join(root, 'mono')], { rules });
    const worktree = entries.find((e) => e.project.kind === 'worktree');
    expect(worktree?.project.group).toBe(join(root, 'mono'));
    const [group] = groupProjects(entries);
    expect(groupProjects(entries)).toHaveLength(1);
    expect(group).toMatchObject({ name: 'mono', worktrees: 1, artifacts: 3 });
    expect(group?.touchedAt).toBeDefined();
  });

  it('reads dormancy from git activity, not from artifact mtimes', async () => {
    const root = buildTree({
      old: { '.git': { logs: { HEAD: 'x' } }, node_modules: { 'a.js': blob(100) } },
      fresh: { '.git': { logs: { HEAD: 'x' } }, node_modules: { 'b.js': blob(100) } },
    });
    // artifacts untouched for ages in both; only "fresh" had recent git activity
    backdate(join(root, 'old'), 90);
    backdate(join(root, 'fresh', 'node_modules'), 90);
    const now = Date.now();

    const { entries } = await scanAll([root], { rules });
    const groups = groupProjects(entries).toSorted(compareGroups(now));
    expect(groups.map((g) => [g.name, isDormant(g, now)])).toEqual([
      ['old', true],
      ['fresh', false],
    ]);
    expect(activityOf(groups[1] as (typeof groups)[number])).toBeGreaterThan(now - DAY);

    const stale = await scanAll([root], { rules, dormantFor: 30 * DAY });
    expect(stale.entries.map((e) => projectName(e.project))).toEqual(['old']);
    expect(stale.summary.dropped['active-project']).toBe(1);
  });
});

describe('git evidence', () => {
  it('reports whether git ignores a directory', async () => {
    const repo = buildTree({
      '.gitignore': 'node_modules\n',
      node_modules: { 'a.js': 'x' },
      dist: { 'b.js': 'x' },
    });
    git(repo, 'init', '-q');
    expect(await isGitIgnored(join(repo, 'node_modules'))).toBe(true);
    expect(await isGitIgnored(join(repo, 'dist'))).toBe(false);
    expect(await isGitIgnored(join(buildTree({ x: null }), 'x'))).toBeUndefined();
    expect(await isGitIgnored(join(repo, 'x'), 'definitely-not-git')).toBeUndefined();
  });

  it('records it on entries inside a repository only', async () => {
    const repo = buildTree({
      '.gitignore': 'node_modules\n',
      node_modules: { 'a.js': 'x' },
      dist: { 'b.js': 'x' },
    });
    git(repo, 'init', '-q');
    const { entries } = await scanAll([repo], { rules });
    expect(
      entries
        .map((e) => [rel(repo, e.path), e.gitIgnored])
        .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['dist', false],
      ['node_modules', true],
    ]);
    const plain = await scanAll([buildTree({ node_modules: { 'a.js': 'x' } })], { rules });
    expect(plain.entries[0]?.gitIgnored).toBeUndefined();
  });
});

describe('syncProvider', () => {
  it.each([
    ['/Users/me/Dropbox/app/node_modules', 'Dropbox'],
    ['/Users/me/Library/CloudStorage/OneDrive-Acme/x', 'Cloud storage'],
    ['/Users/me/Library/Mobile Documents/com~apple~CloudDocs/x', 'iCloud Drive'],
    ['/Users/me/Google Drive/p', 'Google Drive'],
  ])('%s → %s', (path, provider) => expect(syncProvider(path, '/Users/me')).toBe(provider));

  it('ignores ordinary folders and lookalikes', () => {
    expect(syncProvider('/Users/me/dev/app', '/Users/me')).toBeUndefined();
    expect(syncProvider('/Users/me/DropboxClone/app', '/Users/me')).toBeUndefined();
  });
});

describe('groupProjects', () => {
  it('rolls entries up, counting protected separately', async () => {
    const root = buildTree({
      p: {
        'package.json': '{}',
        node_modules: { 'a.js': blob(100) },
        'Cargo.toml': '',
        target: { deploy: { 'k-keypair.json': '[]' } },
      },
    });
    const { entries } = await scanAll([root], { rules });
    const [group] = groupProjects(entries);
    expect(group).toMatchObject({ name: 'p', artifacts: 1, protected: 1 });
    expect(group?.bytes).toBe(entries.find((e) => !e.protection)?.bytes);
    expect(group?.ecosystems).toContain('javascript-typescript');
  });
});
