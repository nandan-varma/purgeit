import { writeFileSync } from 'node:fs';

import type { Command } from 'commander';

import { createProgram } from '../src/cli/program.js';

const quiet = () => {};

/** The CLI's commands and options as data, for the docs site (which cannot import commander). */
export function buildCliReference(): string {
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
  const describe = (command: Command) => ({
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
  });
  return `${JSON.stringify(program.commands.map(describe), null, 2)}\n`;
}

if (process.argv[1]?.endsWith('cli-reference.ts')) {
  writeFileSync(new URL('../docs/src/generated/cli.json', import.meta.url), buildCliReference());
}
