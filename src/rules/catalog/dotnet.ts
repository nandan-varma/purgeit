import type { RuleDefinition } from './types.js';

export const dotnetRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: '.vs',
    categories: ['dotnet'],
    description: "Visual Studio's local solution cache",
  },
  {
    kind: 'gated',
    name: 'bin',
    categories: ['dotnet', 'java-jvm'],
    description:
      ".NET build output next to a project/solution file — also Eclipse's default Java output directory next to a .classpath",
    when: [{ glob: '*.csproj' }, { glob: '*.sln' }, { file: '.classpath' }],
  },
  {
    kind: 'gated',
    name: 'obj',
    categories: ['dotnet'],
    description: '.NET intermediate build output next to a project/solution file',
    when: [{ glob: '*.csproj' }, { glob: '*.sln' }],
  },
];
