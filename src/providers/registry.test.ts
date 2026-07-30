import { describe, expect, it } from 'vitest';
import { loadProvider } from './registry.js';

describe('loadProvider', () => {
  it('loads the aws provider', async () => {
    const provider = await loadProvider('aws');
    expect(provider.id).toBe('aws');
  });

  it('throws for a provider not yet supported', async () => {
    await expect(loadProvider('gcp')).rejects.toThrow(/not yet supported/);
  });
});
