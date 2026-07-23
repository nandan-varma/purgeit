import type { RuleDefinition } from './types.js';

export const dartFlutterRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: '.dart_tool',
    categories: ['dart-flutter'],
    description: 'Dart/Flutter tooling cache (pub, build_runner, analyzer)',
  },
];
