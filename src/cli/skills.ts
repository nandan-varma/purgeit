import { readdir, readFile } from 'node:fs/promises';
import { formatErrorMessage } from '../format.js';

export interface SkillsIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export const SKILLS_USAGE = `Usage: purgeit skills <list|get> [name] [options]

Serves purgeit's agentic-skill content (see skills/purgeit/ in the package)
so instructions for AI agents always match the installed version instead of
going stale in a tool description.

  purgeit skills list               List available skills
  purgeit skills get <name>         Print a skill's content
  purgeit skills get <name> --full  Also append the full CLI flag / library API reference

Skills: core, cloud`;

/** Name -> one-line description, shown by `skills list`. `reference` is an addendum (--full), not a standalone skill, so it's deliberately absent here. */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  core: 'Safety rules, CLI and library usage — start here.',
  cloud: 'AWS/GCP cloud cleanup — tag filters, cost caveats, stronger delete safety.',
};

/**
 * Locates the package's bundled skills/purgeit/ directory relative to this
 * module's own location — same dual-candidate trick cli.ts's
 * readOwnVersion() uses for package.json, since this file runs both as
 * built `dist/cli.js` (one directory below the package root) and directly
 * from `src/cli/skills.ts` in dev (two directories below).
 */
async function resolveSkillsDir(): Promise<URL> {
  const candidates = [
    new URL('../skills/purgeit/', import.meta.url),
    new URL('../../skills/purgeit/', import.meta.url),
  ];
  for (const url of candidates) {
    try {
      await readdir(url);
      return url;
    } catch {
      // try next candidate
    }
  }
  throw new Error('could not locate the skills/ directory relative to the installed package');
}

async function readSkillFile(dir: URL, name: string): Promise<string> {
  return readFile(new URL(`${name}.md`, dir), 'utf-8');
}

/**
 * Implements `purgeit skills list|get` — see SKILL.md's discovery-stub
 * pattern (modeled on agent-browser's `agent-browser skills get core`):
 * shipping the actual guidance as CLI-served content, not baked into a
 * tool description, so it can't go stale between releases.
 */
export async function runSkillsCommand(argv: string[], io: SkillsIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));

  const [subcommand, ...rest] = argv;

  if (subcommand !== 'list' && subcommand !== 'get') {
    stderr(
      subcommand === undefined
        ? 'purgeit: missing skills subcommand'
        : `purgeit: unknown skills subcommand '${subcommand}'`,
    );
    stderr(`\n${SKILLS_USAGE}`);
    return 2;
  }

  let dir: URL;
  try {
    dir = await resolveSkillsDir();
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

  if (subcommand === 'list') {
    for (const [name, description] of Object.entries(SKILL_DESCRIPTIONS)) {
      stdout(`${name.padEnd(8)} ${description}`);
    }
    return 0;
  }

  const name = rest.find((arg) => !arg.startsWith('--'));
  const full = rest.includes('--full');
  if (name === undefined) {
    stderr('purgeit: "skills get" needs a skill name');
    stderr(`\n${SKILLS_USAGE}`);
    return 2;
  }
  if (!(name in SKILL_DESCRIPTIONS)) {
    stderr(
      `purgeit: unknown skill '${name}' (expected one of: ${Object.keys(SKILL_DESCRIPTIONS).join(', ')})`,
    );
    return 2;
  }

  try {
    let content = await readSkillFile(dir, name);
    if (full) {
      content = `${content}\n\n${await readSkillFile(dir, 'reference')}`;
    }
    stdout(content.trimEnd());
    return 0;
  } catch (err) {
    stderr(`purgeit: failed to read skill '${name}': ${formatErrorMessage(err)}`);
    return 2;
  }
}
