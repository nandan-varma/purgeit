import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Stack,
} from '@aws-sdk/client-cloudformation';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, describe, expect, it } from 'vitest';
import type { CloudDiscoveryOptions, CloudScanEvent } from '../types.js';
import { discoverAwsResources } from './discover.js';

const cfMock = mockClient(CloudFormationClient);
const ceMock = mockClient(CostExplorerClient);

function stack(overrides: Partial<Stack> = {}): Stack {
  return {
    StackId: `arn:aws:cloudformation:us-east-1:123:stack/${overrides.StackName ?? 'stack'}/abc`,
    StackName: 'stack',
    CreationTime: new Date('2024-01-01T00:00:00Z'),
    StackStatus: 'CREATE_COMPLETE',
    Tags: [{ Key: 'purgeit-managed', Value: 'true' }],
    ...overrides,
  };
}

function baseOpts(overrides: Partial<CloudDiscoveryOptions> = {}): CloudDiscoveryOptions {
  return {
    tags: new Map([['purgeit-managed', 'true']]),
    withCost: false,
    ...overrides,
  };
}

async function collect(opts: CloudDiscoveryOptions): Promise<CloudScanEvent[]> {
  const events: CloudScanEvent[] = [];
  for await (const event of discoverAwsResources(opts)) {
    events.push(event);
  }
  return events;
}

describe('discoverAwsResources', () => {
  afterEach(() => {
    cfMock.reset();
    ceMock.reset();
  });

  it('rejects an empty tags map instead of matching everything', async () => {
    await expect(collect(baseOpts({ tags: new Map() }))).rejects.toThrow(/at least one --tag/);
    expect(cfMock.calls()).toHaveLength(0);
  });

  it('requires every configured tag to match (AND semantics)', async () => {
    cfMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        stack({
          StackName: 'both-match',
          Tags: [
            { Key: 'purgeit-managed', Value: 'true' },
            { Key: 'team', Value: 'platform' },
          ],
        }),
        stack({
          StackName: 'only-one-matches',
          Tags: [
            { Key: 'purgeit-managed', Value: 'true' },
            { Key: 'team', Value: 'other' },
          ],
        }),
      ],
    });
    const events = await collect(
      baseOpts({
        tags: new Map([
          ['purgeit-managed', 'true'],
          ['team', 'platform'],
        ]),
      }),
    );
    const labels = events
      .filter((e): e is Extract<CloudScanEvent, { type: 'found' }> => e.type === 'found')
      .map((e) => e.resource.label);
    expect(labels).toEqual(['both-match']);
  });

  it('yields only stacks matching the configured tag key/value', async () => {
    cfMock.on(DescribeStacksCommand).resolves({
      Stacks: [stack({ StackName: 'tagged' }), stack({ StackName: 'untagged', Tags: [] })],
    });

    const events = await collect(baseOpts({ region: 'us-east-1' }));
    const found = events.filter((e) => e.type === 'found');
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      type: 'found',
      resource: {
        id: 'arn:aws:cloudformation:us-east-1:123:stack/tagged/abc',
        provider: 'aws',
        resourceType: 'cloudformation-stack',
        label: 'tagged',
        project: 'us-east-1',
        region: 'us-east-1',
        tags: { 'purgeit-managed': 'true' },
        createdAt: new Date('2024-01-01T00:00:00Z').getTime(),
        cost: null,
      },
    });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('skips a stack missing StackId or StackName', async () => {
    cfMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        stack({ StackId: undefined, StackName: 'no-id' }),
        stack({ StackId: 'arn:no-name', StackName: undefined }),
      ],
    });
    const events = await collect(baseOpts());
    expect(events.filter((e) => e.type === 'found')).toHaveLength(0);
  });

  it('skips a stack with no Tags at all', async () => {
    cfMock.on(DescribeStacksCommand).resolves({ Stacks: [stack({ Tags: undefined })] });
    const events = await collect(baseOpts());
    expect(events.filter((e) => e.type === 'found')).toHaveLength(0);
  });

  it('handles a response with no Stacks field at all', async () => {
    cfMock.on(DescribeStacksCommand).resolves({});
    const events = await collect(baseOpts());
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('records createdAt as null when a matched stack has no CreationTime', async () => {
    cfMock.on(DescribeStacksCommand).resolves({
      Stacks: [stack({ StackName: 'no-creation-time', CreationTime: undefined })],
    });
    const events = await collect(baseOpts());
    const found = events.find((e) => e.type === 'found');
    expect(found?.type === 'found' && found.resource.createdAt).toBeNull();
  });

  it('records only tags that have both a Key and a Value', async () => {
    cfMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        stack({
          Tags: [
            { Key: 'purgeit-managed', Value: 'true' },
            { Key: 'incomplete', Value: undefined },
          ],
        }),
      ],
    });
    const events = await collect(baseOpts());
    const found = events.find((e) => e.type === 'found');
    expect(found?.type === 'found' && found.resource.tags).toEqual({ 'purgeit-managed': 'true' });
  });

  it('stops mid-response once aborted, without processing the remaining stacks', async () => {
    cfMock.on(DescribeStacksCommand).resolves({
      Stacks: [stack({ StackName: 'first' }), stack({ StackName: 'second' })],
    });
    const controller = new AbortController();
    const events: CloudScanEvent[] = [];
    for await (const event of discoverAwsResources(baseOpts({ signal: controller.signal }))) {
      events.push(event);
      if (event.type === 'found') controller.abort();
    }
    expect(events.filter((e) => e.type === 'found')).toHaveLength(1);
  });

  it('follows pagination via NextToken', async () => {
    cfMock
      .on(DescribeStacksCommand)
      .resolvesOnce({ Stacks: [stack({ StackName: 'page1' })], NextToken: 'token-2' })
      .resolvesOnce({ Stacks: [stack({ StackName: 'page2' })] });

    const events = await collect(baseOpts());
    const labels = events
      .filter((e): e is Extract<CloudScanEvent, { type: 'found' }> => e.type === 'found')
      .map((e) => e.resource.label);
    expect(labels).toEqual(['page1', 'page2']);
  });

  it('stops immediately when passed an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    cfMock.on(DescribeStacksCommand).resolves({ Stacks: [stack()] });
    const events = await collect(baseOpts({ signal: controller.signal }));
    expect(events).toEqual([{ type: 'done' }]);
    expect(cfMock.calls()).toHaveLength(0);
  });

  it('sets AWS_PROFILE when a profile is given', async () => {
    const original = process.env.AWS_PROFILE;
    cfMock.on(DescribeStacksCommand).resolves({ Stacks: [] });
    try {
      await collect(baseOpts({ profile: 'my-profile' }));
      expect(process.env.AWS_PROFILE).toBe('my-profile');
    } finally {
      if (original === undefined) delete process.env.AWS_PROFILE;
      else process.env.AWS_PROFILE = original;
    }
  });

  it('fetches and yields cost events when withCost is set', async () => {
    cfMock.on(DescribeStacksCommand).resolves({ Stacks: [stack({ StackName: 'costed' })] });
    ceMock.on(GetCostAndUsageCommand).resolves({
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ['aws:cloudformation:stack-name$costed'],
              Metrics: { UnblendedCost: { Amount: '42', Unit: 'USD' } },
            },
          ],
        },
      ],
    });

    const events = await collect(baseOpts({ withCost: true }));
    const costEvent = events.find((e) => e.type === 'cost');
    expect(costEvent).toEqual({
      type: 'cost',
      id: 'arn:aws:cloudformation:us-east-1:123:stack/costed/abc',
      cost: { amountUsd: 42, basis: 'billed' },
    });
  });

  it('does not fetch cost when withCost is set but nothing matched', async () => {
    cfMock.on(DescribeStacksCommand).resolves({ Stacks: [] });
    await collect(baseOpts({ withCost: true }));
    expect(ceMock.calls()).toHaveLength(0);
  });

  it('omits a cost event for a matched stack Cost Explorer has no data for', async () => {
    cfMock.on(DescribeStacksCommand).resolves({ Stacks: [stack({ StackName: 'no-cost-data' })] });
    ceMock.on(GetCostAndUsageCommand).resolves({ ResultsByTime: [] });

    const events = await collect(baseOpts({ withCost: true }));
    expect(events.filter((e) => e.type === 'cost')).toHaveLength(0);
  });
});
