import type { Command } from 'commander';

interface OptionInfo {
  readonly flags: string;
  /** Every spelling, e.g. `['-x', '--exclude']`. */
  readonly names: readonly string[];
  readonly takesValue: boolean;
  readonly description: string;
  readonly default: unknown;
  readonly choices: readonly string[] | null;
}

export interface CommandInfo {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly arguments: readonly {
    readonly name: string;
    readonly required: boolean;
    readonly variadic: boolean;
  }[];
  readonly options: readonly OptionInfo[];
}

/** The CLI's commands and options as plain data — for the docs, and for shell completions. */
export function describeProgram(program: Command): CommandInfo[] {
  return program.commands.map((command) => ({
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
      names: [option.short, option.long].filter((name): name is string => name !== undefined),
      takesValue: option.required || option.optional,
      description: option.description,
      default: option.defaultValue ?? null,
      choices: option.argChoices ?? null,
    })),
  }));
}
