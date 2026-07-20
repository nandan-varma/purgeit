import { describe, expect, it } from 'vitest';
import { defaultRuleSet, loadConfig, mergeRuleSets, scan } from './index.js';

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

  it('exports loadConfig as a function', () => {
    expect(typeof loadConfig).toBe('function');
  });
});
