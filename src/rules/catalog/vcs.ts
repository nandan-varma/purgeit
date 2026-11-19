import type { RuleDefinition } from './types.js';

/** Version-control metadata directories — never descended into while scanning. */
export const vcsRules: readonly RuleDefinition[] = [
  { kind: 'ignore', name: '.git', categories: ['vcs'], description: 'Git metadata' },
  { kind: 'ignore', name: '.hg', categories: ['vcs'], description: 'Mercurial metadata' },
  { kind: 'ignore', name: '.svn', categories: ['vcs'], description: 'Subversion metadata' },
];
