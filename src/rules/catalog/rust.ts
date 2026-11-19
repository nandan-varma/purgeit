import type { RuleDefinition } from './types.js';

export const rustRules: readonly RuleDefinition[] = [
  {
    kind: 'gated',
    name: 'target',
    categories: ['rust', 'java-jvm'],
    description:
      "Cargo, Maven, sbt and Anchor build output — gated on the manifest beside it, because 'target' is a common name for authored folders",
    when: [
      { file: 'Cargo.toml' },
      { file: 'pom.xml' },
      { file: 'build.sbt' },
      { file: 'build.gradle' },
      { file: 'build.gradle.kts' },
      { file: 'Anchor.toml' },
    ],
  },
  {
    kind: 'gated',
    name: 'registry',
    categories: ['rust'],
    description:
      'Cargo crate registry cache — only inside a Cargo home (~/.cargo), never a folder that merely has this name',
    when: [{ file: '.crates.toml' }, { file: '.crates2.json' }],
  },
];
