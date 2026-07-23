import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, CATEGORY_ORDER, RULE_CATALOG } from './index.js';
import type { RuleCategory } from './types.js';

describe('RULE_CATALOG structural invariants', () => {
  it('every rule has at least one category and a non-empty description', () => {
    for (const rule of RULE_CATALOG) {
      expect(rule.categories.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.name.length).toBeGreaterThan(0);
    }
  });

  it("every rule's categories are declared in CATEGORY_LABELS", () => {
    const known = new Set(Object.keys(CATEGORY_LABELS));
    for (const rule of RULE_CATALOG) {
      for (const category of rule.categories) {
        expect(known.has(category)).toBe(true);
      }
    }
  });

  it('CATEGORY_ORDER is exactly the set of CATEGORY_LABELS keys, no duplicates', () => {
    const labelKeys = Object.keys(CATEGORY_LABELS).sort();
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
    expect([...CATEGORY_ORDER].sort()).toEqual(labelKeys);
  });

  it('every category actually has at least one rule using it (no dead labels)', () => {
    const used = new Set<RuleCategory>();
    for (const rule of RULE_CATALOG) {
      for (const category of rule.categories) used.add(category);
    }
    for (const category of Object.keys(CATEGORY_LABELS) as RuleCategory[]) {
      expect(used.has(category)).toBe(true);
    }
  });

  it('no name is registered under more than one kind', () => {
    const kindByName = new Map<string, string>();
    for (const rule of RULE_CATALOG) {
      const existing = kindByName.get(rule.name);
      expect(
        existing,
        `'${rule.name}' registered under both '${existing}' and '${rule.kind}'`,
      ).toBe(undefined);
      kindByName.set(rule.name, rule.kind);
    }
  });

  it('prune-meta rules are exactly the known VCS metadata directories', () => {
    const pruneMeta = RULE_CATALOG.filter((r) => r.kind === 'prune-meta').map((r) => r.name);
    expect(pruneMeta.sort()).toEqual(['.git', '.hg', '.svn']);
  });
});
