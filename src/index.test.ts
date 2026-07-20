import { describe, expect, it } from 'vitest';
import { VERSION_PLACEHOLDER } from './index.js';

describe('scaffold', () => {
  it('exports a placeholder', () => {
    expect(VERSION_PLACEHOLDER).toBe('0.0.1');
  });
});
