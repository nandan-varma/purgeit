import type { RuleDefinition } from './types.js';

export const zigRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: 'zig-cache',
    categories: ['zig'],
    description: 'Zig compiler cache',
  },
  {
    kind: 'always-safe',
    name: 'zig-out',
    categories: ['zig'],
    description: 'Zig build output',
  },
];
