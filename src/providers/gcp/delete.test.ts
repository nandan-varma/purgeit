import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudDeleteEvent, CloudResource } from '../types.js';

const instanceDeleteMock = vi.fn().mockResolvedValue(undefined);
const clusterDeleteMock = vi.fn().mockResolvedValue(undefined);
const instancesCloseMock = vi.fn().mockResolvedValue(undefined);
const clusterCloseMock = vi.fn().mockResolvedValue(undefined);

// Regular `function` (not an arrow function) — see discover.test.ts's mock
// for why arrow functions can't be used as vitest mock constructors.
vi.mock('@google-cloud/compute', () => ({
  InstancesClient: vi.fn().mockImplementation(function InstancesClient() {
    return {
      delete: instanceDeleteMock,
      close: instancesCloseMock,
    };
  }),
}));

vi.mock('@google-cloud/container', () => ({
  ClusterManagerClient: vi.fn().mockImplementation(function ClusterManagerClient() {
    return {
      deleteCluster: clusterDeleteMock,
      close: clusterCloseMock,
    };
  }),
}));

const { deleteGcpResources } = await import('./delete.js');

function instanceResource(overrides: Partial<CloudResource> = {}): CloudResource {
  return {
    id: 'projects/my-project/zones/us-central1-a/instances/my-instance',
    provider: 'gcp',
    resourceType: 'compute-instance',
    label: 'my-instance',
    project: 'my-project',
    region: 'us-central1-a',
    tags: {},
    createdAt: null,
    cost: null,
    ...overrides,
  };
}

function clusterResource(overrides: Partial<CloudResource> = {}): CloudResource {
  return {
    id: 'projects/my-project/locations/us-central1/clusters/my-cluster',
    provider: 'gcp',
    resourceType: 'gke-cluster',
    label: 'my-cluster',
    project: 'my-project',
    region: 'us-central1',
    tags: {},
    createdAt: null,
    cost: null,
    ...overrides,
  };
}

async function collect(
  resources: readonly CloudResource[],
  opts: Parameters<typeof deleteGcpResources>[1],
): Promise<CloudDeleteEvent[]> {
  const events: CloudDeleteEvent[] = [];
  for await (const event of deleteGcpResources(resources, opts)) {
    events.push(event);
  }
  return events;
}

describe('deleteGcpResources', () => {
  afterEach(() => {
    instanceDeleteMock.mockClear().mockResolvedValue(undefined);
    clusterDeleteMock.mockClear().mockResolvedValue(undefined);
    instancesCloseMock.mockClear();
    clusterCloseMock.mockClear();
  });

  it('deletes a Compute Engine instance by its parsed project/zone/instance', async () => {
    const events = await collect([instanceResource()], {});
    expect(instanceDeleteMock).toHaveBeenCalledWith({
      project: 'my-project',
      zone: 'us-central1-a',
      instance: 'my-instance',
    });
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 0 });
    expect(instancesCloseMock).toHaveBeenCalledOnce();
    expect(clusterCloseMock).toHaveBeenCalledOnce();
  });

  it('deletes a GKE cluster by its resource id as the name', async () => {
    const events = await collect([clusterResource()], {});
    expect(clusterDeleteMock).toHaveBeenCalledWith({
      name: 'projects/my-project/locations/us-central1/clusters/my-cluster',
    });
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 0 });
  });

  it('does not call delete/deleteCluster in dry-run mode', async () => {
    const events = await collect([instanceResource(), clusterResource()], { dryRun: true });
    expect(instanceDeleteMock).not.toHaveBeenCalled();
    expect(clusterDeleteMock).not.toHaveBeenCalled();
    expect(events.filter((e) => e.type === 'deleted')).toHaveLength(2);
  });

  it('reports an error for a failing resource without aborting the batch', async () => {
    instanceDeleteMock.mockRejectedValueOnce(new Error('permission denied'));
    const events = await collect(
      [instanceResource(), clusterResource({ id: 'projects/p/locations/l/clusters/c2' })],
      {},
    );
    expect(events).toContainEqual({
      type: 'error',
      id: instanceResource().id,
      message: 'permission denied',
    });
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 1 });
  });

  it('stringifies a non-Error rejection', async () => {
    instanceDeleteMock.mockRejectedValueOnce('raw string failure');
    const events = await collect([instanceResource()], {});
    expect(events).toContainEqual({
      type: 'error',
      id: instanceResource().id,
      message: 'raw string failure',
    });
  });

  it('yields just done with zero counts when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect([instanceResource()], { signal: controller.signal });
    expect(events).toEqual([{ type: 'done', deleted: 0, failed: 0 }]);
    expect(instanceDeleteMock).not.toHaveBeenCalled();
  });

  it('stops mid-batch once aborted', async () => {
    const controller = new AbortController();
    const events: CloudDeleteEvent[] = [];
    for await (const event of deleteGcpResources(
      [instanceResource({ id: 'projects/p/zones/z/instances/a' }), clusterResource()],
      { signal: controller.signal },
    )) {
      events.push(event);
      controller.abort();
    }
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 0 });
  });
});
