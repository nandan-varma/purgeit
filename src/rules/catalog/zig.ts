import type { RuleDefinition } from './types.js';

export const zigRules: readonly RuleDefinition[] = [
  {
    kind: 'safe',
    name: 'zig-cache',
    categories: ['zig'],
    description: 'Zig compiler cache (Zig ≤ 0.11)',
  },
  {
    kind: 'safe',
    name: '.zig-cache',
    categories: ['zig'],
    description: 'Zig compiler cache (Zig ≥ 0.12)',
  },
  {
    kind: 'safe',
    name: 'zig-out',
    categories: ['zig'],
    description: 'Zig build output',
  },
];
