import { symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { backdate, blob, buildTree, rel } from '../../test/tree.js';
import { createRuleSet } from '../rules/rule-set.js';
import { normalizeRoots, scan, scanAll } from './scan.js';

const rules = createRuleSet();
const SIGNATURE = 'Signature: 8a477f597d28d172789f06886806bc55';

function projects() {
  const root = buildTree({
    'app-a': {
      'package.json': '{}',
      node_modules: { 'pkg.js': blob(5000), nested: { node_modules: { 'deep.js': 'x' } } },
      dist: { 'out.js': blob(100) },
      src: { 'index.ts': 'x' },
    },
    'rust-b': { 'Cargo.toml': '', target: { debug: { bin: blob(20_000) } } },
    'no-manifest': { build: { 'x.o': 'x' } },
    cache: { thing: { 'CACHEDIR.TAG': SIGNATURE, 'data.bin': blob(100) } },
    '.git': { node_modules: { x: 'x' } },
  });
  backdate(root);
  return root;
}

describe('scan', () => {
  it('finds artifacts by rule, with proof, and never enters one', async () => {
    const root = projects();
    const { entries, summary } = await scanAll([root], { rules });
    const found = entries.map((entry) => rel(root, entry.path)).toSorted();
    expect(found).toEqual(['app-a/dist', 'app-a/node_modules', 'cache/thing', 'rust-b/target']);
    expect(summary.entries).toBe(4);
    expect(summary.bytes).toBeGreaterThan(25_000);

    const modules = entries.find((entry) => entry.rule.name === 'node_modules');
    expect(modules).toMatchObject({
      // the fixture's top-level .git makes the whole tree one repository
      project: { root, kind: 'repo' },
      files: 2,
      protection: undefined,
    });
    const tagged = entries.find((entry) => entry.rule.kind === 'marker');
    expect(tagged?.evidence).toBe('CACHEDIR.TAG');
    const dist = entries.find((entry) => entry.rule.name === 'dist');
    expect(dist?.rule.name).toBe('dist');
  });

  it('sorts largest first and reports found, then entry, then done', async () => {
    const root = projects();
    const types: string[] = [];
    for await (const event of scan([root], { rules })) types.push(event.type);
    expect(types[0]).toBe('found');
    expect(types.at(-1)).toBe('done');
    const { entries } = await scanAll([root], { rules });
    expect(entries.map((entry) => entry.bytes)).toEqual(
      entries.map((e) => e.bytes).toSorted((a, b) => b - a),
    );
  });

  it('explains gated matches by their proof', async () => {
    const root = buildTree({ app: { 'package.json': '{}', build: { 'a.js': 'x' } } });
    const { entries } = await scanAll([root], { rules });
    expect(entries[0]?.evidence).toBe('package.json');
  });

  it('filters by size, age, emptiness and drops them with a reason', async () => {
    const root = buildTree({
      small: { node_modules: { a: 'x' } },
      big: { node_modules: { a: blob(300_000) } },
      empty: { node_modules: { nested: null } },
    });
    backdate(join(root, 'small'));
    backdate(join(root, 'empty'));

    const dropped: string[] = [];
    const kept: string[] = [];
    for await (const event of scan([root], { rules, minBytes: 100_000, minAge: 7 * 86_400_000 })) {
      if (event.type === 'dropped') dropped.push(`${rel(root, event.path)}:${event.reason}`);
      if (event.type === 'entry') kept.push(event.entry.path);
    }
    expect(kept).toEqual([]);
    expect(dropped.toSorted()).toEqual([
      'big/node_modules:too-recent',
      'empty/node_modules:empty',
      'small/node_modules:too-small',
    ]);

    const withEmpty = await scanAll([root], { rules, includeEmpty: true });
    expect(withEmpty.entries).toHaveLength(3);
  });

  it('reports protected artifacts without counting them as reclaimable', async () => {
    const root = buildTree({
      app: {
        'Cargo.toml': '',
        target: { deploy: { 'p-keypair.json': '[]' } },
        node_modules: { a: 'x' },
      },
    });
    const { entries, summary } = await scanAll([root], { rules });
    expect(entries.map((e) => [e.rule.name, e.protection])).toEqual([
      ['node_modules', undefined],
      ['target', 'deploy-keypair'],
    ]);
    expect(summary).toMatchObject({ entries: 1, protected: 1 });
  });

  it('honours exclude globs, depth and the ignore list', async () => {
    const root = buildTree({
      a: { node_modules: { x: 'x' } },
      legacy: { b: { node_modules: { x: 'x' } } },
      l1: { l2: { l3: { node_modules: { x: 'x' } } } },
    });
    const paths = async (options: object) =>
      (await scanAll([root], { rules, ...options })).entries
        .map((e) => rel(root, e.path))
        .toSorted();

    expect(await paths({})).toEqual([
      'a/node_modules',
      'l1/l2/l3/node_modules',
      'legacy/b/node_modules',
    ]);
    expect(await paths({ exclude: ['legacy'] })).toEqual([
      'a/node_modules',
      'l1/l2/l3/node_modules',
    ]);
    expect(await paths({ exclude: ['legacy/**'] })).toEqual([
      'a/node_modules',
      'l1/l2/l3/node_modules',
    ]);
    expect(await paths({ exclude: ['**/node_modules'] })).toEqual([]);
    expect(await paths({ depth: 2 })).toEqual(['a/node_modules', 'legacy/b/node_modules']);
    expect(await paths({ rules: createRuleSet({ ...rulesConfig(), ignore: ['l1'] }) })).toEqual([
      'a/node_modules',
      'legacy/b/node_modules',
    ]);
  });

  it('never follows symlinked directories', async () => {
    const outside = buildTree({ node_modules: { x: 'x' } });
    const root = buildTree({ a: { 'package.json': '{}' } });
    symlinkSync(outside, join(root, 'a/linked'));
    symlinkSync(join(outside, 'node_modules'), join(root, 'a/node_modules'));
    expect((await scanAll([root], { rules })).entries).toEqual([]);
  });

  it('skips system folders under the home directory', async () => {
    const home = buildTree({
      Library: { node_modules: { x: 'x' } },
      proj: { node_modules: { x: 'x' } },
    });
    const { entries } = await scanAll([home], { rules, home });
    expect(entries.map((e) => rel(home, e.project.root))).toEqual(['proj']);
  });

  it('scans several roots once each and counts unreadable directories', async () => {
    const root = projects();
    const both = await scanAll([root, join(root, 'app-a'), root], { rules });
    expect(both.entries).toHaveLength(4);
    const missing = await scanAll([join(root, 'nope')], { rules });
    expect(missing.summary.unreadable).toBe(1);
  });

  it('stops quietly when aborted', async () => {
    const root = projects();
    const controller = new AbortController();
    controller.abort();
    const events = [];
    for await (const event of scan([root], { rules, signal: controller.signal }))
      events.push(event);
    expect(events.some((event) => event.type === 'done')).toBe(false);
    await expect(scanAll([root], { rules, signal: controller.signal })).rejects.toThrow(/summary/);
  });
});

describe('normalizeRoots', () => {
  it('drops duplicates and roots nested in another', () => {
    const abs = (...paths: string[]) => paths.map((path) => resolve(path));
    expect(normalizeRoots(abs('/a/b', '/a', '/a/', '/ab', '/a/b/c'))).toEqual(abs('/a', '/ab'));
  });
});

function rulesConfig() {
  return {
    defaults: true,
    safe: [],
    gated: [],
    markers: [],
    disable: [],
    ignore: [],
    exclude: [],
    groups: {},
  };
}
