import { describe, expect, it } from 'vitest';
import type { PurgeitUserConfig } from '../config/schema.js';
import { GATED_NAMES } from './default-rules.js';
import { defaultRuleSet, mergeRuleSets, restrictRuleSetToTargets } from './merge.js';

describe('defaultRuleSet', () => {
  it('has a gate for every GATED_NAMES entry and an empty skipDirs', () => {
    const rs = defaultRuleSet();
    for (const name of GATED_NAMES) {
      expect(rs.gated.has(name)).toBe(true);
    }
    expect(rs.skipDirs.size).toBe(0);
    expect(rs.alwaysSafe.has('node_modules')).toBe(true);
  });
});

describe('mergeRuleSets', () => {
  it('returns the base ruleset unchanged when no config is given', () => {
    const base = defaultRuleSet();
    expect(mergeRuleSets(base, undefined)).toBe(base);
  });

  it('merges alwaysSafe additions and removals on top of defaults', () => {
    const base = defaultRuleSet();
    const config: PurgeitUserConfig = {
      alwaysSafe: ['.turbo-fixture-cache'],
      alwaysSafeRemove: ['node_modules'],
    };
    const merged = mergeRuleSets(base, config);
    expect(merged.alwaysSafe.has('.turbo-fixture-cache')).toBe(true);
    expect(merged.alwaysSafe.has('node_modules')).toBe(false);
    // base ruleset is untouched
    expect(base.alwaysSafe.has('node_modules')).toBe(true);
  });

  it('adds declarative gated rules and removes built-in ones', () => {
    const base = defaultRuleSet();
    const config: PurgeitUserConfig = {
      gated: [{ name: 'output', when: { file: 'mkdocs.yml' } }],
      gatedRemove: ['bin'],
    };
    const merged = mergeRuleSets(base, config);
    expect(merged.gated.has('output')).toBe(true);
    expect(merged.gated.has('bin')).toBe(false);
    expect(merged.gated.has('obj')).toBe(true);
  });

  it('adds function-based gated rules', () => {
    const base = defaultRuleSet();
    const gateFn = () => true;
    const merged = mergeRuleSets(base, { gated: [{ name: 'custom', gate: gateFn }] });
    expect(merged.gated.get('custom')).toBe(gateFn);
  });

  it('always-safe wins when a name is both always-safe and gated', () => {
    const base = defaultRuleSet();
    const merged = mergeRuleSets(base, {
      alwaysSafe: ['build'],
      gated: [{ name: 'build', when: { file: 'x' } }],
    });
    expect(merged.alwaysSafe.has('build')).toBe(true);
    expect(merged.gated.has('build')).toBe(false);
  });

  it('merges skipDirs, pruneNames, and targets', () => {
    const base = defaultRuleSet();
    const merged = mergeRuleSets(base, {
      skipDirs: ['archive'],
      pruneNames: ['.jj'],
      targets: { python: ['__pycache__', '.venv'] },
    });
    expect(merged.skipDirs.has('archive')).toBe(true);
    expect(merged.pruneMeta.has('.jj')).toBe(true);
    expect(merged.pruneMeta.has('.git')).toBe(true);
    expect(merged.targets.get('python')).toEqual(['__pycache__', '.venv']);
  });

  it('extends: replace starts from empty sets instead of the defaults', () => {
    const base = defaultRuleSet();
    const merged = mergeRuleSets(base, {
      extends: 'replace',
      alwaysSafe: ['only-this'],
    });
    expect(merged.alwaysSafe.has('only-this')).toBe(true);
    expect(merged.alwaysSafe.has('node_modules')).toBe(false);
    expect(merged.gated.size).toBe(0);
    expect(merged.pruneMeta.size).toBe(0);
  });
});

describe('restrictRuleSetToTargets', () => {
  it('is a no-op for an empty token list', () => {
    const base = defaultRuleSet();
    expect(restrictRuleSetToTargets(base, [])).toBe(base);
  });

  it('restricts alwaysSafe/gated to literal names', () => {
    const base = defaultRuleSet();
    const restricted = restrictRuleSetToTargets(base, ['node_modules', 'Pods']);
    expect(restricted.alwaysSafe).toEqual(new Set(['node_modules']));
    expect([...restricted.gated.keys()]).toEqual(['Pods']);
  });

  it('expands a named group from ruleSet.targets', () => {
    const base = mergeRuleSets(defaultRuleSet(), { targets: { python: ['__pycache__', '.venv'] } });
    const restricted = restrictRuleSetToTargets(base, ['python']);
    expect(restricted.alwaysSafe).toEqual(new Set(['__pycache__', '.venv']));
    expect(restricted.gated.size).toBe(0);
  });

  it('leaves pruneMeta, skipDirs, and targets untouched', () => {
    const base = defaultRuleSet();
    const restricted = restrictRuleSetToTargets(base, ['node_modules']);
    expect(restricted.pruneMeta).toBe(base.pruneMeta);
    expect(restricted.skipDirs).toBe(base.skipDirs);
    expect(restricted.targets).toBe(base.targets);
  });
});
