import type { RuleDefinition } from './types.js';

export const terraformRules: readonly RuleDefinition[] = [
  {
    kind: 'safe',
    name: '.terragrunt-cache',
    categories: ['terraform'],
    description: 'Terragrunt download cache (modules and providers, re-fetched on the next run)',
  },
];
