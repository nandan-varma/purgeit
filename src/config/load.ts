import { stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { z } from 'zod';
import { PurgeitError } from '../errors.js';
import { type Config, ConfigSchema } from './schema.js';

export interface LoadedConfig {
  readonly config: Config;
  /** The file it came from; undefined when none was found. */
  readonly source: string | undefined;
}

export interface LoadConfigOptions {
  readonly cwd: string;
  /** An explicit config file (any extension c12 understands) instead of searching `cwd`. */
  readonly file?: string;
}

/**
 * Finds and validates `purgeit.config.{ts,mts,js,mjs,cjs,json,...}` or the
 * `purgeit` key of package.json in `cwd`. TypeScript configs load directly.
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  if (
    options.file !== undefined &&
    !(await stat(options.file).then(
      (s) => s.isFile(),
      () => false,
    ))
  ) {
    throw new PurgeitError(`Config file not found: ${options.file}`);
  }
  const { loadConfig: loadC12 } = await import('c12');
  const loaded = await loadC12({
    name: 'purgeit',
    cwd: options.cwd,
    ...(options.file === undefined ? {} : { configFile: options.file }),
    rcFile: false,
    globalRc: false,
    dotenv: false,
    packageJson: true,
  }).catch((error: unknown) => {
    throw new PurgeitError(`Could not load config: ${(error as Error).message}`);
  });

  const fromPackage = loaded.layers?.some(
    (layer) => layer.configFile === 'package.json' && Object.keys(layer.config ?? {}).length > 0,
  );
  // c12 reports forward slashes on Windows; callers compare and print native paths.
  const source =
    loaded._configFile === undefined
      ? fromPackage
        ? join(options.cwd, 'package.json')
        : undefined
      : normalize(loaded._configFile);
  const parsed = ConfigSchema.safeParse(loaded.config ?? {});
  if (!parsed.success) {
    throw new PurgeitError(
      `Invalid config${source ? ` (${source})` : ''}:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return { config: parsed.data, source };
}
