import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';

describe('loadConfig tsLoader fallback', () => {
  let root: string;
  let loadConfig: typeof import('./resolve.js').loadConfig;

  beforeEach(async () => {
    vi.resetModules();
    // Mock cosmiconfig-typescript-loader with TypeScriptLoader as undefined
    // so the `?? mod.default` fallback in resolve.ts:27 is exercised.
    vi.doMock('cosmiconfig-typescript-loader', () => ({
      TypeScriptLoader: undefined,
      default: () => (filepath: string) => {
        const raw = readFileSync(filepath, 'utf-8');
        // Strip `export default` and eval as CJS so cosmiconfig gets an object.
        const js = raw.replace(/export\s+default\s+/, 'module.exports = ');
        // biome-ignore lint/security/noGlobalEval: test-only mock loader
        const m = eval(`(function(module,exports,require){${js}})`) as (
          mod: { exports: unknown },
          exp: unknown,
          req: typeof require,
        ) => void;
        const mod = { exports: {} as unknown };
        m(mod, mod.exports, require);
        return mod.exports;
      },
    }));
    ({ loadConfig } = await import('./resolve.js'));
  });

  afterEach(() => cleanupTree(root));

  it('loads a .ts config via the default export fallback when TypeScriptLoader is absent', async () => {
    root = buildTree({
      'purgeit.config.ts': "export default { skipDirs: ['from-default-export'] };\n",
    });
    const result = await loadConfig({ cwd: root, stopDir: root });
    expect(result.config).toEqual({ skipDirs: ['from-default-export'] });
  });
});
