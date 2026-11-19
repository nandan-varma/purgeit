import type { RuleDefinition } from './types.js';

export const rubyRules: readonly RuleDefinition[] = [
  {
    kind: 'safe',
    name: '.yardoc',
    categories: ['ruby'],
    description: 'YARD documentation generation cache',
  },
  {
    kind: 'gated',
    name: 'pkg',
    categories: ['ruby'],
    description: 'Gem build output from `rake build`/`gem build`, only next to a Gemfile',
    when: { file: 'Gemfile' },
  },
];
