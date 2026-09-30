import type { RuleDefinition } from './types.js';

export const markerRules: readonly RuleDefinition[] = [
  {
    kind: 'marker',
    name: 'CACHEDIR.TAG',
    categories: ['cache-marker'],
    description:
      'Any directory carrying a Cache Directory Tagging Specification tag (https://bford.info/cachedir/) — written by Cargo, Go, Zig, ccache, pytest and others to declare the directory a regenerable cache',
    file: 'CACHEDIR.TAG',
    signature: 'Signature: 8a477f597d28d172789f06886806bc55',
  },
];
