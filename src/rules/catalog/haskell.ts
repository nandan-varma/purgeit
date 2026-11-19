import type { RuleDefinition } from './types.js';

export const haskellRules: readonly RuleDefinition[] = [
  {
    kind: 'safe',
    name: 'dist-newstyle',
    categories: ['haskell'],
    description: 'Cabal (new-style) build output',
  },
  {
    kind: 'safe',
    name: '.stack-work',
    categories: ['haskell'],
    description: 'Stack build output',
  },
];
