import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { defaultRuleSet } from '../rules/merge.js';
import { discoverRoots } from './discover.js';

describe('discoverRoots', () => {
  let home: string;
  afterEach(() => cleanupTree(home));

  it('returns existing well-known roots and home folders that hold projects', async () => {
    home = buildTree({
      dev: {},
      '.claude': { worktrees: { wt1: { '.git': 'gitdir: x' } } },
      Library: { CloudStorage: {} },
      Sites: { blog: { 'package.json': '{}' } },
      Clients: { acme: { api: { 'go.mod': 'module x' } } },
      Photos: { '2024': { 'img.jpg': 'x' } },
      Deep: { a: { b: { c: { 'package.json': '{}' } } } },
      '.config': { app: { 'package.json': '{}' } },
      node_modules: { pkg: { 'package.json': '{}' } },
      Applications: { tool: { 'package.json': '{}' } },
      'notes.txt': 'x',
    });
    const roots = await discoverRoots(defaultRuleSet(), home);
    expect(roots.sort()).toEqual(
      [
        join(home, 'dev'),
        join(home, 'Library', 'CloudStorage'),
        join(home, '.claude', 'worktrees'),
        join(home, 'Sites'),
        join(home, 'Clients'),
      ].sort(),
    );
  });

  it('returns only the well-known roots when the home directory cannot be listed', async () => {
    home = buildTree({});
    expect(await discoverRoots(defaultRuleSet(), join(home, 'missing'))).toEqual([]);
  });

  it('skips unreadable project folders instead of failing', async () => {
    home = buildTree({ Work: { link: 'not-a-dir' } });
    expect(await discoverRoots(defaultRuleSet(), home)).toEqual([]);
  });
});
