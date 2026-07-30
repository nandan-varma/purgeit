import { describe, expect, it } from 'vitest';
import { deleteGcpResources } from './delete.js';
import { discoverGcpResources } from './discover.js';
import { createGcpProvider } from './provider.js';

describe('createGcpProvider', () => {
  it('wires the gcp id and the discover/delete implementations', () => {
    const provider = createGcpProvider();
    expect(provider.id).toBe('gcp');
    expect(provider.discover).toBe(discoverGcpResources);
    expect(provider.delete).toBe(deleteGcpResources);
  });
});
