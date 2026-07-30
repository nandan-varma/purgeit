import { CloudFormationClient, DeleteStackCommand } from '@aws-sdk/client-cloudformation';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, describe, expect, it } from 'vitest';
import type { CloudDeleteEvent, CloudResource } from '../types.js';
import { deleteAwsResources } from './delete.js';

const cfMock = mockClient(CloudFormationClient);

function resource(overrides: Partial<CloudResource> = {}): CloudResource {
  return {
    id: 'arn:aws:cloudformation:us-east-1:123:stack/my-stack/abc',
    provider: 'aws',
    resourceType: 'cloudformation-stack',
    label: 'my-stack',
    project: 'us-east-1',
    region: 'us-east-1',
    tags: {},
    createdAt: null,
    cost: null,
    ...overrides,
  };
}

async function collect(
  resources: readonly CloudResource[],
  opts: Parameters<typeof deleteAwsResources>[1],
): Promise<CloudDeleteEvent[]> {
  const events: CloudDeleteEvent[] = [];
  for await (const event of deleteAwsResources(resources, opts)) {
    events.push(event);
  }
  return events;
}

describe('deleteAwsResources', () => {
  afterEach(() => cfMock.reset());

  it('deletes each resource and reports the tally', async () => {
    cfMock.on(DeleteStackCommand).resolves({});
    const events = await collect([resource()], {});
    expect(events).toEqual([
      { type: 'deleting', id: resource().id },
      { type: 'deleted', id: resource().id, dryRun: false },
      { type: 'done', deleted: 1, failed: 0 },
    ]);
    expect(cfMock.calls()).toHaveLength(1);
  });

  it('does not call DeleteStack in dry-run mode', async () => {
    const events = await collect([resource()], { dryRun: true });
    expect(events).toEqual([
      { type: 'deleting', id: resource().id },
      { type: 'deleted', id: resource().id, dryRun: true },
      { type: 'done', deleted: 1, failed: 0 },
    ]);
    expect(cfMock.calls()).toHaveLength(0);
  });

  it('reports an error for one failing resource without aborting the batch', async () => {
    cfMock.on(DeleteStackCommand).rejectsOnce(new Error('access denied')).resolves({});
    const events = await collect(
      [resource({ id: 'arn:a', label: 'a' }), resource({ id: 'arn:b', label: 'b' })],
      {},
    );
    expect(events).toContainEqual({ type: 'error', id: 'arn:a', message: 'access denied' });
    expect(events).toContainEqual({ type: 'deleted', id: 'arn:b', dryRun: false });
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 1 });
  });

  it('stringifies a non-Error rejection', async () => {
    // aws-sdk-client-mock's .rejects() always normalizes to a real Error
    // instance, so a genuinely non-Error rejection (which the SDK itself
    // would never throw, but the code defends against regardless) needs
    // callsFake to bypass that normalization.
    cfMock.on(DeleteStackCommand).callsFake(() => Promise.reject('raw string failure'));
    const events = await collect([resource()], {});
    expect(events).toContainEqual({
      type: 'error',
      id: resource().id,
      message: 'raw string failure',
    });
  });

  it('yields just done with zero counts when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect([resource()], { signal: controller.signal });
    expect(events).toEqual([{ type: 'done', deleted: 0, failed: 0 }]);
    expect(cfMock.calls()).toHaveLength(0);
  });

  it('stops mid-batch once aborted', async () => {
    cfMock.on(DeleteStackCommand).resolves({});
    const controller = new AbortController();
    const events: CloudDeleteEvent[] = [];
    for await (const event of deleteAwsResources(
      [resource({ id: 'arn:a', label: 'a' }), resource({ id: 'arn:b', label: 'b' })],
      { signal: controller.signal },
    )) {
      events.push(event);
      controller.abort();
    }
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 0 });
  });

  it('constructs a region-less client when no resource carries a region', async () => {
    cfMock.on(DeleteStackCommand).resolves({});
    const events = await collect([resource({ region: null })], {});
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 0 });
  });
});
