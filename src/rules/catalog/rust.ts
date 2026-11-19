import type { RuleDefinition } from './types.js';

export const rustRules: readonly RuleDefinition[] = [
  {
    kind: 'safe',
    name: 'target',
    categories: ['rust', 'java-jvm'],
    description: "Cargo build output — also Maven's default build output directory",
  },
  {
    kind: 'safe',
    name: 'registry',
    categories: ['rust'],
    description: 'Cargo crate registry cache (~/.cargo/registry/), regenerable via cargo build',
  },
];
