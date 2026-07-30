import { describe, expect, it } from 'vitest';
import { loadCloudFormationSdk, loadCostExplorerSdk } from './sdk-loader.js';

describe('loadCloudFormationSdk / loadCostExplorerSdk', () => {
  it('loads and caches the CloudFormation SDK module', async () => {
    const first = await loadCloudFormationSdk();
    const second = await loadCloudFormationSdk();
    expect(first).toBe(second);
    expect(typeof first.CloudFormationClient).toBe('function');
  });

  it('loads and caches the Cost Explorer SDK module', async () => {
    const first = await loadCostExplorerSdk();
    const second = await loadCostExplorerSdk();
    expect(first).toBe(second);
    expect(typeof first.CostExplorerClient).toBe('function');
  });
});
