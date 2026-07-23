import type { GateCondition } from '../../config/schema.js';
import type { RuleDefinition } from './types.js';

const gradleManifest: readonly GateCondition[] = [
  { file: 'build.gradle' },
  { file: 'build.gradle.kts' },
  { file: 'settings.gradle' },
  { file: 'settings.gradle.kts' },
];

export const javaJvmRules: readonly RuleDefinition[] = [
  {
    kind: 'gated',
    name: '.gradle',
    categories: ['java-jvm'],
    description: 'Gradle project/build cache',
    when: gradleManifest,
  },
  {
    kind: 'gated',
    name: '.cxx',
    categories: ['java-jvm'],
    description: 'Android NDK/CMake native build cache (Android Studio)',
    when: gradleManifest,
  },
];
