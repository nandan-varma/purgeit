import { readdirSync, readFileSync } from 'node:fs';

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

describe('catalog dependencies', () => {
  // The docs site imports this folder from source and installs only its own
  // dependencies, so the catalog may import nothing at runtime beyond itself.
  it('has no runtime imports outside the folder', () => {
    const dir = new URL('./', import.meta.url);
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    )) {
      const imports = readFileSync(new URL(file, dir), 'utf8').match(/^import .*$/gm) ?? [];
      for (const line of imports) {
        expect(
          line.startsWith('import type') || /from '\.\/[^']+'/.test(line),
          `${file}: ${line}`,
        ).toBe(true);
      }
    }
  });
});
