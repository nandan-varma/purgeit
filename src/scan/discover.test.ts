import { describe, expect, it } from 'vitest';

import { buildTree, rel } from '../../test/tree.js';
import { createRuleSet } from '../rules/rule-set.js';
import { discoverRoots } from './discover.js';

describe('discoverRoots', () => {
  it('finds well-known roots and home folders that hold projects', async () => {
    const home = buildTree({
      dev: { app: { 'package.json': '{}' } },
      '.claude': { worktrees: { wt: { '.git': 'gitdir' } } },
      work: { client: { service: { 'Cargo.toml': '' } } },
      Documents: { 'notes.txt': 'x' },
      Library: { app: { 'package.json': '{}' } },
      node_modules: { dep: { 'package.json': '{}' } },
      '.hidden': { app: { 'package.json': '{}' } },
    });
    const roots = (await discoverRoots(createRuleSet(), { home })).map((root) => rel(home, root));
    expect(roots.toSorted()).toEqual(['.claude/worktrees', 'dev', 'work']);
  });

  it('returns nothing for an empty home', async () => {
    expect(await discoverRoots(createRuleSet(), { home: buildTree({}) })).toEqual([]);
  });
});
