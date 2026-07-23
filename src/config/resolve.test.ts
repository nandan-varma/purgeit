import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { loadConfig } from './resolve.js';

describe('loadConfig', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('returns no config when noConfig is set, without touching the filesystem', async () => {
    root = buildTree({ 'purgeit.config.json': '{"alwaysSafe":["should-not-load"]}' });
    const result = await loadConfig({ cwd: root, noConfig: true });
    expect(result).toEqual({ config: undefined, filepath: undefined });
  });

  it('loads an explicit --config path, bypassing search', async () => {
    root = buildTree({
      'custom.json': '{"alwaysSafe":["x"]}',
      nested: { 'purgeit.config.json': '{}' },
    });
    const result = await loadConfig({ configPath: join(root, 'custom.json') });
    expect(result.config).toEqual({ alwaysSafe: ['x'] });
    expect(result.filepath).toBe(join(root, 'custom.json'));
  });

  it('throws with the source path when an explicit config is invalid', async () => {
    root = buildTree({ 'bad.json': '{"extends":"bogus"}' });
    await expect(loadConfig({ configPath: join(root, 'bad.json') })).rejects.toThrow(/bad\.json/);
  });

  it('finds purgeit.config.json by searching upward from cwd', async () => {
    root = buildTree({ 'purgeit.config.json': '{"skipDirs":["archive"]}', project: null });
    const result = await loadConfig({ cwd: join(root, 'project'), stopDir: root });
    expect(result.config).toEqual({ skipDirs: ['archive'] });
    expect(result.filepath).toBe(join(root, 'purgeit.config.json'));
  });

  it('finds .purgeitrc.json', async () => {
    root = buildTree({ '.purgeitrc.json': '{"pruneNames":[".jj"]}' });
    const result = await loadConfig({ cwd: root, stopDir: root });
    expect(result.config).toEqual({ pruneNames: ['.jj'] });
  });

  it('finds a "purgeit" key in package.json', async () => {
    root = buildTree({ 'package.json': '{"name":"x","purgeit":{"skipDirs":["tmp"]}}' });
    const result = await loadConfig({ cwd: root, stopDir: root });
    expect(result.config).toEqual({ skipDirs: ['tmp'] });
  });

  it('loads a CommonJS purgeit.config.js', async () => {
    root = buildTree({ 'purgeit.config.js': "module.exports = { skipDirs: ['from-js'] };\n" });
    const result = await loadConfig({ cwd: root, stopDir: root });
    expect(result.config).toEqual({ skipDirs: ['from-js'] });
  });

  it('loads a TypeScript purgeit.config.ts via the TypeScript loader', async () => {
    root = buildTree({
      'purgeit.config.ts': "export default { skipDirs: ['from-ts'] };\n",
    });
    const result = await loadConfig({ cwd: root, stopDir: root });
    expect(result.config).toEqual({ skipDirs: ['from-ts'] });
  });

  it('reuses the cached TypeScript loader on a second .ts config load', async () => {
    root = buildTree({
      'purgeit.config.ts': "export default { skipDirs: ['from-ts'] };\n",
    });
    await loadConfig({ cwd: root, stopDir: root });
    const result = await loadConfig({ cwd: root, stopDir: root });
    expect(result.config).toEqual({ skipDirs: ['from-ts'] });
  });

  it('returns undefined config when nothing is found within stopDir', async () => {
    root = buildTree({ project: null });
    const result = await loadConfig({ cwd: join(root, 'project'), stopDir: root });
    expect(result.config).toBeUndefined();
    expect(result.filepath).toBeUndefined();
  });

  it('treats an explicitly-loaded config module exporting nothing as no config, but still reports its filepath', async () => {
    root = buildTree({ 'empty.config.js': 'module.exports = undefined;\n' });
    const result = await loadConfig({ configPath: join(root, 'empty.config.js') });
    expect(result.config).toBeUndefined();
    expect(result.filepath).toBe(join(root, 'empty.config.js'));
  });

  it('defaults cwd to process.cwd() when not provided', async () => {
    root = buildTree({ 'purgeit.config.json': '{"skipDirs":["from-default-cwd"]}' });
    const originalCwd = process.cwd();
    process.chdir(root);
    try {
      const result = await loadConfig({ stopDir: root });
      expect(result.config).toEqual({ skipDirs: ['from-default-cwd'] });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('throws when a discovered config fails validation', async () => {
    root = buildTree({ 'purgeit.config.json': '{"gated":[{"name":"x"}]}' });
    await expect(loadConfig({ cwd: root, stopDir: root })).rejects.toThrow(
      /exactly one of "when" or "gate"/,
    );
  });
});
