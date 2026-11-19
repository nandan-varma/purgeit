import { PurgeitError } from '../errors.js';
import type { CommandInfo } from './introspect.js';

const SHELLS = ['bash', 'zsh', 'fish'] as const;

const quote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;
const oneLine = (text: string): string => text.replaceAll(/\s+/g, ' ').trim();

function bash(commands: readonly CommandInfo[]): string {
  const cases = commands
    .map(
      (command) =>
        `    ${[command.name, ...command.aliases].join('|')}) opts=${quote(command.options.flatMap((o) => o.names).join(' '))} ;;`,
    )
    .join('\n');
  return `# purgeit bash completion — add to ~/.bashrc:  source <(purgeit completion bash)
_purgeit() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" cmd="\${COMP_WORDS[1]}" opts=""
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W ${quote(commands.map((c) => c.name).join(' '))} -- "$cur") )
    return
  fi
  case "$cmd" in
${cases}
  esac
  if [[ "$cur" == -* ]]; then COMPREPLY=( $(compgen -W "$opts" -- "$cur") ); else COMPREPLY=( $(compgen -d -- "$cur") ); fi
}
complete -o filenames -F _purgeit purgeit
`;
}

function zsh(commands: readonly CommandInfo[]): string {
  const list = commands
    .map(
      (command) =>
        `    ${quote(`${command.name}:${oneLine(command.description).replaceAll(':', ' -')}`)}`,
    )
    .join('\n');
  const cases = commands
    .map((command) => {
      const options = command.options
        .map((option) => {
          const choices = option.choices ? `(${option.choices.join(' ')})` : '';
          const value = option.takesValue ? `:value:${choices}` : '';
          const spec = (name: string) =>
            `${name}[${oneLine(option.description).replaceAll(/[[\]]/g, '')}]${value}`;
          return `        ${quote(spec(option.names.at(-1) ?? option.flags))}`;
        })
        .join(' \\\n');
      return `    ${[command.name, ...command.aliases].join('|')})
      _arguments \\
${options}${options ? ' \\\n' : ''}        '*:directory:_files -/'
      ;;`;
    })
    .join('\n');
  return `#compdef purgeit
# purgeit zsh completion — put this file as _purgeit on your $fpath, or: source <(purgeit completion zsh)
_purgeit() {
  local -a commands
  commands=(
${list}
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi
  case $words[2] in
${cases}
  esac
}
compdef _purgeit purgeit
`;
}

function fish(commands: readonly CommandInfo[]): string {
  const subcommands = commands
    .map(
      (c) =>
        `complete -c purgeit -n '__fish_use_subcommand' -a ${quote(c.name)} -d ${quote(oneLine(c.description))}`,
    )
    .join('\n');
  const options = commands
    .flatMap((command) =>
      command.options.map((option) => {
        const long = option.names.find((n) => n.startsWith('--'))?.slice(2);
        const short = option.names.find((n) => /^-[^-]$/.test(n))?.slice(1);
        return `complete -c purgeit -n '__fish_seen_subcommand_from ${command.name}' ${long ? `-l ${long}` : ''} ${short ? `-s ${short}` : ''} ${option.takesValue ? '-r' : ''} ${option.choices ? `-a ${quote(option.choices.join(' '))}` : ''} -d ${quote(oneLine(option.description))}`.replaceAll(
          /\s+/g,
          ' ',
        );
      }),
    )
    .join('\n');
  return `# purgeit fish completion:  purgeit completion fish > ~/.config/fish/completions/purgeit.fish
${subcommands}
${options}
`;
}

/** A completion script for `shell`, generated from the CLI's own command and option metadata. */
export function completionScript(shell: string, commands: readonly CommandInfo[]): string {
  switch (shell) {
    case 'bash':
      return bash(commands);
    case 'zsh':
      return zsh(commands);
    case 'fish':
      return fish(commands);
    default:
      throw new PurgeitError(`Unknown shell "${shell}" — choose one of ${SHELLS.join(', ')}.`);
  }
}
