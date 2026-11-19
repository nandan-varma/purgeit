import { describe, expect, it } from 'vitest';

import { ConfigSchema } from '../config/schema.js';
import { PurgeitError } from '../errors.js';
import { createRuleSet, onlySafeRules, restrictRuleSet } from './rule-set.js';

const config = (input: object) => ConfigSchema.parse(input);

describe('createRuleSet', () => {
  it('compiles the built-in catalog', () => {
    const rules = createRuleSet();
    expect(rules.named.get('node_modules')?.kind).toBe('safe');
    expect(rules.named.get('build')?.kind).toBe('gated');
    expect(rules.markers.map((rule) => rule.name)).toContain('CACHEDIR.TAG');
    expect([...rules.ignore]).toEqual(expect.arrayContaining(['.git', '.hg', '.svn']));
  });

  it('adds and overrides rules from config', () => {
    const rules = createRuleSet(
      config({
        safe: ['.my-cache'],
        gated: [{ name: 'out', when: { file: 'project.toml' } }],
        markers: [{ name: 'TAGGED', file: 'TAG', signature: 'sig' }],
        ignore: ['secrets'],
      }),
    );
    expect(rules.named.get('.my-cache')?.categories).toEqual(['custom']);
    expect(rules.named.get('out')?.kind).toBe('gated');
    expect(rules.markers.map((rule) => rule.name)).toContain('TAGGED');
    expect(rules.ignore.has('secrets')).toBe(true);

    const replaced = createRuleSet(
      config({ gated: [{ name: 'node_modules', when: { file: 'x' } }] }),
    );
    expect(replaced.named.get('node_modules')?.kind).toBe('gated');
  });

  it('can start empty and still never enters VCS metadata', () => {
    const rules = createRuleSet(config({ defaults: false, safe: ['x'] }));
    expect([...rules.named.keys()]).toEqual(['x']);
    expect(rules.markers).toEqual([]);
    expect(rules.ignore.has('.git')).toBe(true);
  });

  it('disables built-ins by name and rejects unknown names', () => {
    const rules = createRuleSet(config({ disable: ['node_modules', 'CACHEDIR.TAG'] }));
    expect(rules.named.has('node_modules')).toBe(false);
    expect(rules.markers).toEqual([]);
    expect(() => createRuleSet(config({ disable: ['nope'] }))).toThrow(PurgeitError);
    expect(() => createRuleSet(config({ disable: ['.git'] }))).toThrow(PurgeitError);
  });
});

describe('restrictRuleSet', () => {
  const rules = createRuleSet(config({ groups: { js: ['node_modules', 'dist'] } }));

  it('keeps only named rules, expanding groups', () => {
    const only = restrictRuleSet(rules, ['js', 'target']);
    expect([...only.named.keys()].toSorted()).toEqual(['dist', 'node_modules', 'target']);
    expect(only.markers).toEqual([]);
    expect(restrictRuleSet(rules, ['CACHEDIR.TAG']).markers).toHaveLength(1);
  });

  it('rejects names that match nothing', () => {
    expect(() => restrictRuleSet(rules, ['node_modulez'])).toThrow(/node_modulez/);
  });
});

describe('onlySafeRules', () => {
  it('drops every gated rule', () => {
    const safe = onlySafeRules(createRuleSet());
    expect(safe.named.has('build')).toBe(false);
    expect(safe.named.has('node_modules')).toBe(true);
    expect([...safe.named.values()].every((rule) => rule.kind === 'safe')).toBe(true);
  });
});
