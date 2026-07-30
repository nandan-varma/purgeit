import { describe, expect, it } from 'vitest';
import { deleteAwsResources } from './delete.js';
import { discoverAwsResources } from './discover.js';
import { createAwsProvider } from './provider.js';

describe('createAwsProvider', () => {
  it('wires the aws id and the discover/delete implementations', () => {
    const provider = createAwsProvider();
    expect(provider.id).toBe('aws');
    expect(provider.discover).toBe(discoverAwsResources);
    expect(provider.delete).toBe(deleteAwsResources);
  });
});
