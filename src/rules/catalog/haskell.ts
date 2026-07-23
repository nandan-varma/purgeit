import type { RuleDefinition } from './types.js';

export const haskellRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: 'dist-newstyle',
    categories: ['haskell'],
    description: 'Cabal (new-style) build output',
  },
  {
    kind: 'always-safe',
    name: '.stack-work',
    categories: ['haskell'],
    description: 'Stack build output',
  },
];
