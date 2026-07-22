import { cosmiconfig } from 'cosmiconfig';
import type { PurgeitUserConfig } from './schema.js';
import { assertPurgeitUserConfig } from './schema.js';

export interface LoadConfigOptions {
  /** Directory to start the upward search from. Defaults to process.cwd(). */
  readonly cwd?: string | undefined;
  /** Explicit config file path — bypasses search entirely. */
  readonly configPath?: string | undefined;
  /** Skip resolution entirely; equivalent to no config file existing. */
  readonly noConfig?: boolean | undefined;
  /** Directory the upward search must not go above. Mainly for tests. */
  readonly stopDir?: string | undefined;
}

export interface LoadedConfig {
  readonly config: PurgeitUserConfig | undefined;
  readonly filepath: string | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: cosmiconfig-typescript-loader's return type is opaque
let tsLoaderCache: ((...args: any[]) => any) | undefined;

async function tsLoader(filepath: string): Promise<string> {
  if (tsLoaderCache === undefined) {
    const mod = await import('cosmiconfig-typescript-loader');
    tsLoaderCache = (mod.TypeScriptLoader ?? mod.default)();
  }
  return (await tsLoaderCache(filepath)) as string;
}

async function createExplorer(stopDir: string | undefined) {
  return cosmiconfig('purgeit', {
    searchPlaces: [
      'package.json',
      'purgeit.config.js',
      'purgeit.config.mjs',
      'purgeit.config.cjs',
      'purgeit.config.ts',
      'purgeit.config.mts',
      'purgeit.config.cts',
      'purgeit.config.json',
      '.purgeitrc',
      '.purgeitrc.json',
    ],
    loaders: {
      '.ts': tsLoader,
      '.mts': tsLoader,
      '.cts': tsLoader,
    },
    ...(stopDir !== undefined ? { stopDir } : {}),
  });
}

/**
 * Resolves the user's purgeit config, searching upward from `cwd` unless an
 * explicit `configPath` is given or resolution is disabled via `noConfig`.
 * Throws a descriptive error (via `assertPurgeitUserConfig`) if a config
 * file was found but doesn't match the expected shape.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  if (options.noConfig) {
    return { config: undefined, filepath: undefined };
  }

  const explorer = await createExplorer(options.stopDir);
  const result = options.configPath
    ? await explorer.load(options.configPath)
    : await explorer.search(options.cwd ?? process.cwd());

  if (!result || result.isEmpty) {
    return { config: undefined, filepath: result?.filepath };
  }

  assertPurgeitUserConfig(result.config, result.filepath);
  return { config: result.config, filepath: result.filepath };
}
