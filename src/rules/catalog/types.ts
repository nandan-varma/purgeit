import type { GateCondition } from '../../config/schema.js';

/**
 * Ecosystem tags used to group the catalog for docs and for anyone building
 * their own tooling on top of it. A rule can belong to more than one — e.g.
 * `build` and `vendor` are genuinely polyglot (see shared.ts) — so this is
 * always an array, even for the common single-ecosystem case.
 */
export type RuleCategory =
  | 'javascript-typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'php'
  | 'ruby'
  | 'java-jvm'
  | 'dotnet'
  | 'apple'
  | 'elixir'
  | 'haskell'
  | 'elm'
  | 'zig'
  | 'dart-flutter'
  | 'cpp'
  | 'vcs';

/** Human-readable section labels, e.g. for a docs accordion keyed by category. */
export const CATEGORY_LABELS: Readonly<Record<RuleCategory, string>> = {
  'javascript-typescript': 'JavaScript / TypeScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  php: 'PHP',
  ruby: 'Ruby',
  'java-jvm': 'Java / JVM (Gradle, Maven, Android, Eclipse)',
  dotnet: '.NET',
  apple: 'Apple / Xcode / Swift',
  elixir: 'Elixir',
  haskell: 'Haskell',
  elm: 'Elm',
  zig: 'Zig',
  'dart-flutter': 'Dart / Flutter',
  cpp: 'C / C++ (CMake)',
  vcs: 'Version control metadata',
};

/** Fixed display order for docs, roughly by ecosystem popularity; VCS metadata last. */
export const CATEGORY_ORDER: readonly RuleCategory[] = [
  'javascript-typescript',
  'python',
  'rust',
  'go',
  'apple',
  'java-jvm',
  'dotnet',
  'php',
  'ruby',
  'dart-flutter',
  'elixir',
  'cpp',
  'haskell',
  'elm',
  'zig',
  'vcs',
];

interface BaseRuleDefinition {
  readonly name: string;
  readonly categories: readonly RuleCategory[];
  readonly description: string;
}

/** Deletable wherever the name appears — no sibling proof required. */
export interface AlwaysSafeRuleDefinition extends BaseRuleDefinition {
  readonly kind: 'always-safe';
}

/** Deletable only when `when` proves a sibling manifest makes it real generated output. */
export interface GatedRuleDefinition extends BaseRuleDefinition {
  readonly kind: 'gated';
  readonly when: GateCondition | readonly GateCondition[];
}

/** Never descended into while scanning (VCS metadata) — not itself a deletion candidate. */
export interface PruneMetaRuleDefinition extends BaseRuleDefinition {
  readonly kind: 'prune-meta';
}

export type RuleDefinition =
  | AlwaysSafeRuleDefinition
  | GatedRuleDefinition
  | PruneMetaRuleDefinition;
