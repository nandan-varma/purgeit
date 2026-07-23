import type { RuleDefinition } from './types.js';

/** Version-control metadata directories — never descended into while scanning. */
export const vcsRules: readonly RuleDefinition[] = [
  { kind: 'prune-meta', name: '.git', categories: ['vcs'], description: 'Git metadata' },
  { kind: 'prune-meta', name: '.hg', categories: ['vcs'], description: 'Mercurial metadata' },
  { kind: 'prune-meta', name: '.svn', categories: ['vcs'], description: 'Subversion metadata' },
];
