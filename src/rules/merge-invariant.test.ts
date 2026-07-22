import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('merge.ts module-load invariant', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws at import time when a GATED_NAMES entry has no matching gate', async () => {
    // Mock gate-conditions to return an empty DEFAULT_GATES map,
    // so the invariant check in merge.ts (lines 25-29) fires.
    vi.doMock('./gate-conditions.js', () => ({
      DEFAULT_GATES: new Map(),
    }));
    await expect(import('./merge.js')).rejects.toThrow(/has no matching gate/);
  });
});
