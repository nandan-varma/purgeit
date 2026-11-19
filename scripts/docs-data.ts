import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Command } from 'commander';
import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { createProgram } from '../src/cli/program.js';
import { ConfigSchema } from '../src/config/schema.js';
import { describeWhen } from '../src/rules/catalog/describe.js';
import { RULE_CATALOG } from '../src/rules/catalog/index.js';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../src/rules/catalog/types.js';

const quiet = () => {};
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function describeCommand(command: Command) {
  return {
    name: command.name(),
    aliases: command.aliases(),
    description: command.description(),
    arguments: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      required: argument.required,
      variadic: argument.variadic,
    })),
    options: command.options.map((option) => ({
      flags: option.flags,
      description: option.description,
      default: option.defaultValue ?? null,
      choices: option.argChoices ?? null,
    })),
  };
}

/**
 * Everything the docs site shows that comes from the code: the CLI, the rule
 * catalog, the config schema and the version. The site imports only these JSON
 * files — never the library source — so it builds with its own dependencies.
 */
export function buildDocsData(): Record<string, string> {
  const program = createProgram(
    {
      out: quiet,
      err: quiet,
      cwd: process.cwd(),
      interactive: false,
      confirm: async () => false,
      historyFile: undefined,
    },
    quiet,
  );

  const rules = RULE_CATALOG.map((rule) => ({
    name: rule.name,
    kind: rule.kind,
    categories: rule.categories,
    description: rule.description,
    when: rule.kind === 'gated' ? describeWhen(rule.when) : null,
    file: rule.kind === 'marker' ? rule.file : null,
  }));
  const categories = CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] })).filter(
    ({ id }) => rules.some((rule) => rule.categories.includes(id)),
  );

  return {
    'cli.json': json(program.commands.map(describeCommand)),
    'rules.json': json({ categories, rules }),
    'config.json': json(z.toJSONSchema(ConfigSchema, { io: 'input' })),
    'meta.json': json({ version: pkg.version, node: pkg.engines.node }),
  };
}

export const generatedDir = new URL('../docs/src/generated/', import.meta.url);

if (process.argv[1]?.endsWith('docs-data.ts')) {
  mkdirSync(dirname(fileURLToPath(new URL('x', generatedDir))), { recursive: true });
  for (const [name, content] of Object.entries(buildDocsData())) {
    writeFileSync(new URL(name, generatedDir), content);
  }
}
