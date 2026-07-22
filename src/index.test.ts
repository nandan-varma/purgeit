import { describe, expect, it } from 'vitest';
import {
  applyCliFilters,
  defaultRuleSet,
  loadConfig,
  mergeRuleSets,
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
});
