import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildTree } from '../../test/tree.js';
import { PurgeitError } from '../errors.js';
import { loadConfig } from './load.js';
import { ConfigSchema, defineConfig } from './schema.js';

describe('ConfigSchema', () => {
  it('fills in defaults', () => {
    expect(ConfigSchema.parse({})).toEqual({
      defaults: true,
      safe: [],
      gated: [],
      markers: [],
      disable: [],
      ignore: [],
      exclude: [],
      groups: {},
    });
  });

  it.each([
    [{ typo: 1 }, /typo/],
    [{ safe: ['a/b'] }, /directory name/],
    [{ minAge: 'soon' }, /duration/],
    [{ minSize: 'big' }, /size/],
    [{ depth: 0 }, /depth/],
    [{ gated: [{ name: 'x', when: [] }] }, /gated/],
    [{ groups: { g: [] } }, /groups/],
    [{ safe: ['out'], gated: [{ name: 'out', when: { file: 'a' } }] }, /both safe and gated/],
  ])('rejects %j', (input, message) => {
    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(z.prettifyError((result as { error: z.ZodError }).error)).toMatch(message);
  });

  it('defineConfig is an identity helper', () => {
    const config = { safe: ['x'] };
    expect(defineConfig(config)).toBe(config);
  });
});

describe('loadConfig', () => {
  it('returns defaults when there is no config', async () => {
    const loaded = await loadConfig({ cwd: buildTree({}), userConfigDir: buildTree({}) });
    expect(loaded.source).toBeUndefined();
    expect(loaded.config.defaults).toBe(true);
  });

  it('loads a TypeScript config', async () => {
    const cwd = buildTree({
      'purgeit.config.ts':
        "export default { safe: ['.mycache'], minAge: '3d' } satisfies Record<string, unknown>;\n",
    });
    const loaded = await loadConfig({ cwd, userConfigDir: buildTree({}) });
    expect(loaded.config).toMatchObject({ safe: ['.mycache'], minAge: '3d' });
    expect(loaded.source).toBe(join(cwd, 'purgeit.config.ts'));
  });

  it('loads JSON configs and the package.json "purgeit" key', async () => {
    const json = buildTree({ 'purgeit.config.json': '{"ignore":["vault"]}' });
    expect((await loadConfig({ cwd: json, userConfigDir: buildTree({}) })).config.ignore).toEqual([
      'vault',
    ]);
    const pkg = buildTree({ 'package.json': '{"name":"x","purgeit":{"exclude":["legacy"]}}' });
    expect((await loadConfig({ cwd: pkg, userConfigDir: buildTree({}) })).config.exclude).toEqual([
      'legacy',
    ]);
  });

  it('loads an explicit file and fails clearly when it is missing', async () => {
    const cwd = buildTree({ 'custom.json': '{"safe":["z"]}' });
    expect((await loadConfig({ cwd, file: join(cwd, 'custom.json') })).config.safe).toEqual(['z']);
    await expect(loadConfig({ cwd, file: join(cwd, 'nope.json') })).rejects.toThrow(PurgeitError);
  });

  it('reports invalid configs with the file and the problem', async () => {
    const cwd = buildTree({});
    writeFileSync(join(cwd, 'purgeit.config.json'), '{"minAge":"soon"}');
    await expect(loadConfig({ cwd })).rejects.toThrow(/purgeit\.config\.json[\s\S]*minAge/);
    writeFileSync(join(cwd, 'purgeit.config.json'), '{not json');
    await expect(loadConfig({ cwd })).rejects.toThrow(PurgeitError);
  });
});

describe('loadConfig discovery', () => {
  const noUser = () => buildTree({});

  it('finds the nearest config in an ancestor of the working directory', async () => {
    const root = buildTree({
      'purgeit.config.json': '{"ignore":["outer"]}',
      sub: { 'purgeit.config.json': '{"ignore":["inner"]}', deep: { deeper: null } },
      other: { deep: null },
    });
    const userConfigDir = noUser();
    const nested = await loadConfig({ cwd: join(root, 'sub/deep/deeper'), userConfigDir });
    expect(nested.config.ignore).toEqual(['inner']);
    expect(nested.source).toBe(join(root, 'sub', 'purgeit.config.json'));
    const up = await loadConfig({ cwd: join(root, 'other/deep'), userConfigDir });
    expect(up.config.ignore).toEqual(['outer']);
  });

  it('falls back to the user-level config, then to the defaults', async () => {
    const userConfigDir = buildTree({ 'config.json': '{"minAge":"3d"}' });
    const cwd = buildTree({ a: null });
    const user = await loadConfig({ cwd: join(cwd, 'a'), userConfigDir });
    expect(user.config.minAge).toBe('3d');
    expect(user.source).toBe(join(userConfigDir, 'config.json'));

    const none = await loadConfig({ cwd: join(cwd, 'a'), userConfigDir: join(cwd, 'missing') });
    expect(none.source).toBeUndefined();
    expect(none.config.defaults).toBe(true);
  });

  it('rejects a broken user-level config instead of ignoring it', async () => {
    const userConfigDir = buildTree({ 'config.json': '{"minAge":"soon"}' });
    await expect(loadConfig({ cwd: buildTree({}), userConfigDir })).rejects.toThrow(/minAge/);
  });
});
