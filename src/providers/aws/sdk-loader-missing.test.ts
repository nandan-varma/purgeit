import { describe, expect, it, vi } from 'vitest';

// Simulates the AWS SDK not being installed (it's an optional peer
// dependency) — both loaders must surface a friendly install hint instead of
// a raw "Cannot find module" error.
vi.mock('@aws-sdk/client-cloudformation', () => {
  throw new Error('Cannot find package @aws-sdk/client-cloudformation');
});
vi.mock('@aws-sdk/client-cost-explorer', () => {
  throw new Error('Cannot find package @aws-sdk/client-cost-explorer');
});

const { loadCloudFormationSdk, loadCostExplorerSdk } = await import('./sdk-loader.js');

describe('sdk-loader when the AWS SDK is not installed', () => {
  it('loadCloudFormationSdk throws a friendly install hint', async () => {
    await expect(loadCloudFormationSdk()).rejects.toThrow(/npm install @aws-sdk/);
  });

  it('loadCostExplorerSdk throws a friendly install hint', async () => {
    await expect(loadCostExplorerSdk()).rejects.toThrow(/npm install @aws-sdk/);
  });
});
