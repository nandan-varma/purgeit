import type { GateCondition } from '../../config/schema.js';
import type { RuleDefinition } from './types.js';

/**
 * Rules whose directory name is genuinely reused, unqualified, across several
 * unrelated ecosystems — too generic to trust on name alone, so each one is
 * gated on manifests from every ecosystem that conventionally produces it.
 */
export const sharedRules: readonly RuleDefinition[] = [
  {
    kind: 'gated',
    name: 'build',
    categories: ['javascript-typescript', 'python', 'apple', 'cpp', 'java-jvm', 'dart-flutter'],
    description:
      'Generic build output directory name, reused by npm scripts, Python setuptools, CocoaPods/Xcode, CMake, Gradle, and Flutter — gated on whichever manifest is actually present',
    when: [
      { file: 'Podfile' },
      { glob: '*.xcodeproj' },
      { glob: '*.xcworkspace' },
      { file: 'CMakeLists.txt' },
      { file: 'package.json' },
      { file: 'pyproject.toml' },
      { file: 'requirements.txt' },
      { file: 'build.gradle' },
      { file: 'build.gradle.kts' },
      { file: 'pubspec.yaml' },
    ] satisfies readonly GateCondition[],
  },
  {
    kind: 'gated',
    name: 'vendor',
    categories: ['php', 'go'],
    description:
      "Composer's PHP dependency directory, or a Go module's vendored dependencies — gated on whichever manifest is present",
    when: [{ file: 'composer.json' }, { file: 'go.mod' }] satisfies readonly GateCondition[],
  },
];
