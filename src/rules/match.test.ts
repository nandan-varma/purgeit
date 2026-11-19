import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { backdate, buildTree } from '../../test/tree.js';
import { matchMarker, matchNamed, matchPath } from './match.js';
import { createRuleSet } from './rule-set.js';

const rules = createRuleSet();
const SIGNATURE = 'Signature: 8a477f597d28d172789f06886806bc55';

describe('matchNamed', () => {
  it('claims safe rules without proof', async () => {
    const rule = rules.named.get('node_modules');
    if (rule === undefined) throw new Error('missing');
    expect(await matchNamed(rule, '/x', new Set())).toEqual({ rule, evidence: undefined });
  });

  it('claims gated rules only with proof, and reports it', async () => {
    const rule = rules.named.get('vendor');
    if (rule === undefined) throw new Error('missing');
    expect((await matchNamed(rule, '/x', new Set(['composer.json'])))?.evidence).toBe(
      'composer.json',
    );
    expect(await matchNamed(rule, '/x', new Set(['README.md']))).toBeUndefined();
  });
});

describe('matchMarker', () => {
  it('requires the signature, not just the file', async () => {
    const tagged = buildTree({ CACHEDIR_FAKE: null, 'CACHEDIR.TAG': `${SIGNATURE}\n# cache` });
    expect((await matchMarker(rules, tagged, new Set(['CACHEDIR.TAG'])))?.rule.name).toBe(
      'CACHEDIR.TAG',
    );

    const forged = buildTree({ 'CACHEDIR.TAG': 'hello' });
    expect(await matchMarker(rules, forged, new Set(['CACHEDIR.TAG']))).toBeUndefined();

    const short = buildTree({ 'CACHEDIR.TAG': 'Signature' });
    expect(await matchMarker(rules, short, new Set(['CACHEDIR.TAG']))).toBeUndefined();

    const directory = buildTree({ 'CACHEDIR.TAG': null });
    expect(await matchMarker(rules, directory, new Set(['CACHEDIR.TAG']))).toBeUndefined();
    expect(await matchMarker(rules, directory, new Set())).toBeUndefined();
  });
});

describe('matchPath', () => {
  it('re-derives the decision from the filesystem', async () => {
    const root = buildTree({
      app: { 'package.json': '{}', node_modules: { x: '1' }, build: { y: '1' } },
      bare: { build: { y: '1' } },
      cache: { 'CACHEDIR.TAG': SIGNATURE },
      '.git': { node_modules: null },
      plain: { src: null },
    });
    backdate(root);
    expect((await matchPath(rules, `${root}/app/node_modules`))?.rule.name).toBe('node_modules');
    expect((await matchPath(rules, `${root}/app/build`))?.evidence).toBe('package.json');
    expect(await matchPath(rules, `${root}/bare/build`)).toBeUndefined();
    expect((await matchPath(rules, `${root}/cache`))?.rule.name).toBe('CACHEDIR.TAG');
    expect(await matchPath(rules, `${root}/.git`)).toBeUndefined();
    expect(await matchPath(rules, `${root}/plain/src`)).toBeUndefined();
  });
});

describe('rules that need proof', () => {
  const matched = async (tree: Parameters<typeof buildTree>[0], at: string) => {
    const root = buildTree(tree);
    return (await matchPath(rules, join(root, at)))?.rule.name;
  };

  it('treats a virtualenv as one only when it holds a pyvenv.cfg', async () => {
    expect(await matched({ p: { venv: { 'pyvenv.cfg': 'home = /usr' } } }, 'p/venv')).toBe('venv');
    expect(await matched({ p: { '.venv': { 'pyvenv.cfg': 'x' } } }, 'p/.venv')).toBe('.venv');
    expect(
      await matched({ p: { venv: { 'notes.txt': 'my own folder' } } }, 'p/venv'),
    ).toBeUndefined();
  });

  it('only calls target build output beside a build manifest', async () => {
    expect(await matched({ p: { 'Cargo.toml': '', target: { a: 'x' } } }, 'p/target')).toBe(
      'target',
    );
    expect(await matched({ p: { 'pom.xml': '', target: { a: 'x' } } }, 'p/target')).toBe('target');
    expect(
      await matched({ p: { target: { 'goals.md': 'my targets' } } }, 'p/target'),
    ).toBeUndefined();
  });

  it('only calls registry a cargo cache inside a Cargo home', async () => {
    expect(
      await matched({ '.cargo': { '.crates.toml': '', registry: { a: 'x' } } }, '.cargo/registry'),
    ).toBe('registry');
    expect(
      await matched(
        { app: { registry: { 'index.ts': 'a package registry app' } } },
        'app/registry',
      ),
    ).toBeUndefined();
  });

  it('treats out, coverage, test-results and .cache as generated only beside a manifest', async () => {
    for (const name of ['out', 'coverage', 'test-results', '.cache']) {
      expect(
        await matched({ p: { 'package.json': '{}', [name]: { a: 'x' } } }, `p/${name}`),
        name,
      ).toBe(name);
      expect(
        await matched({ p: { [name]: { 'report.csv': 'authored data' } } }, `p/${name}`),
        name,
      ).toBeUndefined();
    }
  });
});
