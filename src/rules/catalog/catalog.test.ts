import { describe, expect, it } from 'vitest';
import { RULE_CATALOG } from './index.js';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './types.js';

describe('RULE_CATALOG', () => {
  it('names each matching rule once', () => {
    const names = RULE_CATALOG.map((rule) => rule.name);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it('describes every rule and files it under a known category', () => {
    for (const rule of RULE_CATALOG) {
      expect(rule.description, rule.name).not.toBe('');
      expect(rule.categories.length, rule.name).toBeGreaterThan(0);
      for (const category of rule.categories) expect(CATEGORY_LABELS[category]).toBeDefined();
    }
  });

  it('keeps names plain: directory names, never paths', () => {
    for (const rule of RULE_CATALOG) expect(rule.name, rule.name).not.toMatch(/[\\/]/);
  });

  it('orders every category it uses', () => {
    for (const rule of RULE_CATALOG) {
      for (const category of rule.categories) expect(CATEGORY_ORDER).toContain(category);
    }
  });
});
