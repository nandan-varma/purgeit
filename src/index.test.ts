import { describe, expect, it } from 'vitest';
import {
  applyCliFilters,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  defaultRuleSet,
  loadConfig,
  mergeRuleSets,
  RULE_CATALOG,
  restrictRuleSetToTargets,
  scan,
} from './index.js';

describe('public API', () => {
  it('exports scan as a function', () => {
    expect(typeof scan).toBe('function');
  });

  it('exports defaultRuleSet as a function', () => {
    expect(typeof defaultRuleSet).toBe('function');
  });

  it('exports mergeRuleSets as a function', () => {
    expect(typeof mergeRuleSets).toBe('function');
  });

  it('exports restrictRuleSetToTargets as a function', () => {
    expect(typeof restrictRuleSetToTargets).toBe('function');
  });

  it('exports applyCliFilters as a function', () => {
    expect(typeof applyCliFilters).toBe('function');
  });

  it('exports loadConfig as a function', () => {
    expect(typeof loadConfig).toBe('function');
  });

  it('exports RULE_CATALOG as a non-empty array of rule definitions', () => {
    expect(Array.isArray(RULE_CATALOG)).toBe(true);
    expect(RULE_CATALOG.length).toBeGreaterThan(0);
    expect(RULE_CATALOG.every((rule) => typeof rule.name === 'string')).toBe(true);
  });

  it('exports CATEGORY_LABELS and CATEGORY_ORDER in agreement', () => {
    expect([...CATEGORY_ORDER].sort()).toEqual(Object.keys(CATEGORY_LABELS).sort());
  });
});
