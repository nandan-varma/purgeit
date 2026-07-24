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
    categories: [
      'javascript-typescript',
      'python',
      'apple',
      'cpp',
      'java-jvm',
      'dart-flutter',
      'rust',
    ],
    description:
      'Generic build output directory name, reused by npm scripts, Python setuptools, CocoaPods/Xcode, CMake, Gradle, Flutter, and Cargo — gated on whichever manifest is actually present',
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
      { file: 'Cargo.toml' },
    ] satisfies readonly GateCondition[],
  },
  {
    kind: 'gated',
    name: 'vendor',
    categories: ['php', 'go', 'rust', 'ruby'],
    description:
      "Composer's PHP dependency directory, a Go module's vendored dependencies, Cargo's vendored crates, or Bundler's vendored gems — gated on whichever manifest is present",
    when: [
      { file: 'composer.json' },
      { file: 'go.mod' },
      { file: 'Cargo.toml' },
      { file: 'Gemfile' },
    ] satisfies readonly GateCondition[],
  },
];
