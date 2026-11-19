import { describe, expect, it } from 'vitest';

import { PurgeitError } from './errors.js';
import {
  formatAge,
  formatAgo,
  formatDuration,
  formatSize,
  parseDuration,
  parseSize,
} from './units.js';

describe('parseDuration', () => {
  it.each([
    ['0', 0],
    ['90m', 90 * 60_000],
    ['36h', 36 * 3_600_000],
    ['7d', 7 * 86_400_000],
    ['2w', 14 * 86_400_000],
  ])('%s', (input, expected) => expect(parseDuration(input)).toBe(expected));

  it.each(['', 'soon', '7', '-1d', 'd7'])('rejects %j', (input) => {
    expect(() => parseDuration(input)).toThrow(PurgeitError);
  });
});

describe('parseSize', () => {
  it('uses binary units', () => {
    expect(parseSize('1KB')).toBe(1024);
    expect(parseSize('10MB')).toBe(10 * 1024 ** 2);
    expect(parseSize('0')).toBe(0);
  });
  it.each(['', 'big', '-5MB'])('rejects %j', (input) => {
    expect(() => parseSize(input)).toThrow(PurgeitError);
  });
});

describe('formatting', () => {
  it('sizes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(3 * 1024 ** 3)).toBe('3 GB');
  });
  it.each([
    [10_000, 'now'],
    [5 * 60_000, '5m'],
    [3 * 3_600_000, '3h'],
    [34 * 86_400_000, '34d'],
    [240 * 86_400_000, '8mo'],
    [900 * 86_400_000, '2y'],
  ])('age %i → %s', (ms, label) => expect(formatAge(ms)).toBe(label));
  it('ago reads naturally', () => {
    expect(formatAgo(1000)).toBe('just now');
    expect(formatAgo(3 * 86_400_000)).toBe('3d ago');
  });
  it('durations', () => expect(formatDuration(7 * 86_400_000)).toBe('7 days'));
});
