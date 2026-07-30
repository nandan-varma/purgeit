import { describe, expect, it } from 'vitest';
import { loadProvider } from './registry.js';

describe('loadProvider', () => {
  it('loads the aws provider', async () => {
    const provider = await loadProvider('aws');
    expect(provider.id).toBe('aws');
  });

  it('loads the gcp provider', async () => {
    const provider = await loadProvider('gcp');
    expect(provider.id).toBe('gcp');
  });
});
