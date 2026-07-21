import { describe, expect, it } from 'vitest';
import { computeVisibleRows, MIN_VISIBLE_ROWS, NARROW_TERMINAL_COLUMNS } from './layout.js';

describe('computeVisibleRows', () => {
  it('fits as many rows as the terminal height allows once chrome is subtracted', () => {
    expect(computeVisibleRows(40)).toBe(27);
    expect(computeVisibleRows(100)).toBe(87);
  });

  it('never goes below MIN_VISIBLE_ROWS, even on a very short terminal', () => {
    expect(computeVisibleRows(1)).toBe(MIN_VISIBLE_ROWS);
    expect(computeVisibleRows(0)).toBe(MIN_VISIBLE_ROWS);
    expect(computeVisibleRows(-5)).toBe(MIN_VISIBLE_ROWS);
  });
});

describe('NARROW_TERMINAL_COLUMNS', () => {
  it('is a sane positive threshold', () => {
    expect(NARROW_TERMINAL_COLUMNS).toBeGreaterThan(0);
  });
});
