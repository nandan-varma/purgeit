import { describe, expect, it, vi } from 'vitest';

// Simulates the GCP client libraries not being installed (they're optional
// peer dependencies) — both loaders must surface a friendly install hint.
vi.mock('@google-cloud/compute', () => {
  throw new Error('Cannot find package @google-cloud/compute');
});
vi.mock('@google-cloud/container', () => {
  throw new Error('Cannot find package @google-cloud/container');
});

const { loadComputeSdk, loadContainerSdk } = await import('./sdk-loader.js');

describe('sdk-loader when the GCP client libraries are not installed', () => {
  it('loadComputeSdk throws a friendly install hint', async () => {
    await expect(loadComputeSdk()).rejects.toThrow(/npm install @google-cloud/);
  });

  it('loadContainerSdk throws a friendly install hint', async () => {
    await expect(loadContainerSdk()).rejects.toThrow(/npm install @google-cloud/);
  });
});
