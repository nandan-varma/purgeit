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
