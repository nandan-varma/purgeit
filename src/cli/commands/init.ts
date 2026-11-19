import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PurgeitError } from '../../errors.js';
import type { CliEnv } from '../env.js';

export interface InitFlags {
  json: boolean;
}

const EXISTING = [
  'purgeit.config.ts',
  'purgeit.config.mts',
  'purgeit.config.js',
  'purgeit.config.mjs',
  'purgeit.config.cjs',
  'purgeit.config.json',
] as const;

const TYPESCRIPT = `import { defineConfig } from 'purgeit';

export default defineConfig({
  // A project untouched for this long is "dormant": it sorts first, and R / --stale target it.
  // dormantAfter: '30d',

  // Only offer artifacts untouched for at least this long (clean already guards the last 7 days).
  // minAge: '7d',

  // Hide artifacts smaller than this.
  // minSize: '10MB',

  // Directory names that are safe to delete wherever they appear.
  // safe: ['.my-tool-cache'],

  // Never enter these directories.
  // ignore: ['vault'],

  // Skip these globs, relative to each scanned root.
  // exclude: ['legacy/**'],
});
`;

const JSON_CONFIG = `{
  "$schema": "https://purgeit.nandan.fyi/schema.json"
}
`;

/** Writes a starter config in the working directory, never over an existing one. */
export async function runInit(flags: InitFlags, env: CliEnv): Promise<number> {
  for (const name of EXISTING) {
    if (
      await access(join(env.cwd, name)).then(
        () => true,
        () => false,
      )
    ) {
      throw new PurgeitError(`${name} already exists — not overwriting it.`);
    }
  }
  const name = flags.json ? 'purgeit.config.json' : 'purgeit.config.ts';
  await writeFile(join(env.cwd, name), flags.json ? JSON_CONFIG : TYPESCRIPT, { flag: 'wx' });
  env.out(
    `Created ${name}. Every option is documented at https://purgeit.nandan.fyi/docs/reference/configuration`,
  );
  return 0;
}
