import { describe, expect, it } from 'vitest';
import { formatBytes, formatErrorMessage, parseSizeString } from './format.js';

describe('parseSizeString', () => {
  it('parses a bare number as bytes', () => {
    expect(parseSizeString('512')).toBe(512);
  });

  it('parses KB/MB/GB/TB (case-insensitive)', () => {
    expect(parseSizeString('10KB')).toBe(10 * 1024);
    expect(parseSizeString('10mb')).toBe(10 * 1024 ** 2);
    expect(parseSizeString('1GB')).toBe(1024 ** 3);
    expect(parseSizeString('1tb')).toBe(1024 ** 4);
  });

  it('allows a space between number and unit, and decimals', () => {
    expect(parseSizeString('1.5 MB')).toBe(Math.round(1.5 * 1024 ** 2));
  });

  it('throws on an unparseable string', () => {
    expect(() => parseSizeString('not-a-size')).toThrow(/invalid size/);
  });

  it('throws on a negative number', () => {
    expect(() => parseSizeString('-5MB')).toThrow(/invalid size/);
  });

  it('throws on a string that matches the regex but parses to NaN', () => {
    expect(() => parseSizeString('.')).toThrow(/invalid size/);
  });

  it('throws on an unrecognized unit', () => {
    expect(() => parseSizeString('5XB')).toThrow(/invalid size unit/);
  });
});

describe('formatBytes', () => {
  it('formats bytes below 1024 as-is', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KB/MB/GB/TB with one decimal', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB');
  });

  it('caps at TB for absurdly large sizes', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024.0 TB');
  });

  it('returns "0 B" for negative, NaN, or Infinity input', () => {
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});

describe('formatErrorMessage', () => {
  it('returns message from an Error instance', () => {
    expect(formatErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error value', () => {
    expect(formatErrorMessage('raw string')).toBe('raw string');
  });

  it('stringifies null', () => {
    expect(formatErrorMessage(null)).toBe('null');
  });

  it('stringifies undefined', () => {
    expect(formatErrorMessage(undefined)).toBe('undefined');
  });
});
