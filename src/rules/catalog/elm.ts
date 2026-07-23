import type { RuleDefinition } from './types.js';

export const elmRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: 'elm-stuff',
    categories: ['elm'],
    description: 'Elm compiler cache and dependencies',
  },
];
