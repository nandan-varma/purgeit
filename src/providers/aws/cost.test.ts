import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchAwsStackCosts } from './cost.js';

const ceMock = mockClient(CostExplorerClient);

describe('fetchAwsStackCosts', () => {
  afterEach(() => ceMock.reset());

  it('returns an empty map without calling Cost Explorer when no stack names are given', async () => {
    const costs = await fetchAwsStackCosts([], {});
    expect(costs.size).toBe(0);
    expect(ceMock.calls()).toHaveLength(0);
  });

  it('maps billed cost to the matching stack name, ignoring stacks not asked for', async () => {
    ceMock.on(GetCostAndUsageCommand).resolves({
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ['aws:cloudformation:stack-name$my-stack'],
              Metrics: { UnblendedCost: { Amount: '12.34', Unit: 'USD' } },
            },
            {
              Keys: ['aws:cloudformation:stack-name$other-stack'],
              Metrics: { UnblendedCost: { Amount: '99.00', Unit: 'USD' } },
            },
          ],
        },
      ],
    });

    const costs = await fetchAwsStackCosts(['my-stack'], { region: 'us-east-1' });
    expect(costs.get('my-stack')).toEqual({ amountUsd: 12.34, basis: 'billed' });
    expect(costs.has('other-stack')).toBe(false);
  });

  it('accumulates cost across multiple ResultsByTime buckets for the same stack', async () => {
    ceMock.on(GetCostAndUsageCommand).resolves({
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ['aws:cloudformation:stack-name$my-stack'],
              Metrics: { UnblendedCost: { Amount: '10', Unit: 'USD' } },
            },
          ],
        },
        {
          Groups: [
            {
              Keys: ['aws:cloudformation:stack-name$my-stack'],
              Metrics: { UnblendedCost: { Amount: '5', Unit: 'USD' } },
            },
          ],
        },
      ],
    });

    const costs = await fetchAwsStackCosts(['my-stack'], {});
    expect(costs.get('my-stack')?.amountUsd).toBe(15);
  });

  it('skips groups missing a key or amount, and non-finite amounts', async () => {
    ceMock.on(GetCostAndUsageCommand).resolves({
      ResultsByTime: [
        {
          Groups: [
            { Keys: undefined, Metrics: { UnblendedCost: { Amount: '10', Unit: 'USD' } } },
            { Keys: ['aws:cloudformation:stack-name$my-stack'], Metrics: undefined },
            {
              Keys: ['aws:cloudformation:stack-name$my-stack'],
              Metrics: { UnblendedCost: { Amount: 'not-a-number', Unit: 'USD' } },
            },
          ],
        },
      ],
    });

    const costs = await fetchAwsStackCosts(['my-stack'], {});
    expect(costs.size).toBe(0);
  });

  it('handles a response with no ResultsByTime at all', async () => {
    ceMock.on(GetCostAndUsageCommand).resolves({});
    const costs = await fetchAwsStackCosts(['my-stack'], {});
    expect(costs.size).toBe(0);
  });

  it('handles a ResultsByTime entry with no Groups', async () => {
    ceMock.on(GetCostAndUsageCommand).resolves({ ResultsByTime: [{}] });
    const costs = await fetchAwsStackCosts(['my-stack'], {});
    expect(costs.size).toBe(0);
  });
});
