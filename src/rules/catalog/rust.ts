import type { RuleDefinition } from './types.js';

export const rustRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: 'target',
    categories: ['rust', 'java-jvm'],
    description: "Cargo build output — also Maven's default build output directory",
  },
  {
    kind: 'always-safe',
    name: 'registry',
    categories: ['rust'],
    description: 'Cargo crate registry cache (~/.cargo/registry/), regenerable via cargo build',
  },
];
