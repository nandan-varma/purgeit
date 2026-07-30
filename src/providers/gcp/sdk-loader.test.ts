import { describe, expect, it } from 'vitest';
import { loadComputeSdk, loadContainerSdk } from './sdk-loader.js';

describe('loadComputeSdk / loadContainerSdk', () => {
  it('loads and caches the Compute Engine SDK module', async () => {
    const first = await loadComputeSdk();
    const second = await loadComputeSdk();
    expect(first).toBe(second);
    expect(typeof first.InstancesClient).toBe('function');
  });

  it('loads and caches the GKE SDK module', async () => {
    const first = await loadContainerSdk();
    const second = await loadContainerSdk();
    expect(first).toBe(second);
    expect(typeof first.ClusterManagerClient).toBe('function');
  });
});
