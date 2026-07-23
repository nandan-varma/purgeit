import type { RuleDefinition } from './types.js';

export const appleRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: 'DerivedData',
    categories: ['apple'],
    description: 'Xcode derived data',
  },
  {
    kind: 'always-safe',
    name: '.build',
    categories: ['apple'],
    description: 'Swift Package Manager build output (`swift build`)',
  },
  {
    kind: 'always-safe',
    name: '.swiftpm',
    categories: ['apple'],
    description: "Xcode's local Swift Package Manager cache",
  },
  {
    kind: 'gated',
    name: 'Pods',
    categories: ['apple'],
    description: "CocoaPods dependencies — only meaningful next to a project's Podfile",
    when: { file: 'Podfile' },
  },
  {
    kind: 'gated',
    name: 'Carthage',
    categories: ['apple'],
    description: 'Carthage build/checkout output, fully regenerable via `carthage bootstrap`',
    when: [{ file: 'Cartfile' }, { file: 'Cartfile.resolved' }],
  },
];
