import { stat } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';

import envPaths from 'env-paths';
import { z } from 'zod';

import { errorMessage, PurgeitError } from '../errors.js';
import { type Config, ConfigSchema } from './schema.js';

export interface LoadedConfig {
  readonly config: Config;
  /** The file it came from; undefined when none was found. */
  readonly source: string | undefined;
}

export interface LoadConfigOptions {
  readonly cwd: string;
  /** An explicit config file (any extension c12 understands) instead of searching. */
  readonly file?: string;
  /** Where the user-level config lives. Defaults to the platform's config directory. */
  readonly userConfigDir?: string;
}

/** `~/.config/purgeit` (or the platform's equivalent). */
const defaultUserConfigDir = (): string => envPaths('purgeit', { suffix: '' }).config;

async function readFrom(cwd: string, file: string | undefined, packageJson: boolean) {
  const { loadConfig: loadC12 } = await import('c12');
  const loaded = await loadC12({
    name: 'purgeit',
    cwd,
    configFile: file,
    rcFile: false,
    globalRc: false,
    dotenv: false,
    packageJson,
  }).catch((error: unknown) => {
    throw new PurgeitError(`Could not load config: ${errorMessage(error)}`);
  });

  const fromPackage = loaded.layers?.some(
    (layer) => layer.configFile === 'package.json' && Object.keys(layer.config ?? {}).length > 0,
  );
  // c12 reports forward slashes on Windows; callers compare and print native paths.
  const source =
    loaded._configFile === undefined
      ? fromPackage
        ? join(cwd, 'package.json')
        : undefined
      : normalize(loaded._configFile);
  return { raw: loaded.config ?? {}, source };
}

function validate(raw: unknown, source: string | undefined): LoadedConfig {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PurgeitError(
      `Invalid config${source ? ` (${source})` : ''}:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return { config: parsed.data, source };
}

/**
 * Finds and validates the config. With `file`, exactly that file. Otherwise
 * the nearest `purgeit.config.{ts,mts,js,mjs,cjs,json,…}` or `purgeit` key of a
 * package.json, searching from `cwd` upward; then the user-level
 * `config.{ts,json,…}` in the platform's config directory; then the defaults.
 * The nearest config wins outright — configs are not merged.
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  if (options.file !== undefined) {
    if (
      !(await stat(options.file).then(
        (s) => s.isFile(),
        () => false,
      ))
    ) {
      throw new PurgeitError(`Config file not found: ${options.file}`);
    }
    const { raw, source } = await readFrom(options.cwd, options.file, true);
    return validate(raw, source);
  }

  for (let dir = resolve(options.cwd); ; dir = dirname(dir)) {
    const found = await readFrom(dir, undefined, true);
    if (found.source !== undefined) return validate(found.raw, found.source);
    if (dirname(dir) === dir) break;
  }

  const user = await readFrom(
    options.userConfigDir ?? defaultUserConfigDir(),
    'config',
    false,
  ).catch(
    // a missing user config directory simply means there is none
    () => undefined,
  );
  return user?.source === undefined ? validate({}, undefined) : validate(user.raw, user.source);
}
