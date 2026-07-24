import type { RuleDefinition } from './types.js';

export const elixirRules: readonly RuleDefinition[] = [
  {
    kind: 'always-safe',
    name: '.elixir_ls',
    categories: ['elixir'],
    description: 'ElixirLS language server cache',
  },
  {
    kind: 'gated',
    name: '_build',
    categories: ['elixir'],
    description: 'Mix compiled build output, regenerable via `mix compile`',
    when: { file: 'mix.exs' },
  },
  {
    kind: 'gated',
    name: 'deps',
    categories: ['elixir'],
    description: 'Mix fetched dependencies, regenerable via `mix deps.get`',
    when: { file: 'mix.exs' },
  },
];
