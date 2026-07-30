import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudDiscoveryOptions, CloudScanEvent } from '../types.js';

interface FakeInstance {
  name?: string;
  labels?: Record<string, string>;
  creationTimestamp?: string;
}
interface FakeCluster {
  name?: string;
  location?: string;
  resourceLabels?: Record<string, string>;
  createTime?: string;
}

let instancePages: Array<[string, { instances?: FakeInstance[] }]> = [];
let clustersResult: { clusters?: FakeCluster[] } = {};

const instancesCloseMock = vi.fn().mockResolvedValue(undefined);
const clusterCloseMock = vi.fn().mockResolvedValue(undefined);
const listClustersMock = vi.fn(async () => [clustersResult]);

// Regular `function` (not an arrow function) so `new InstancesClient()` in
// discover.ts actually works — vitest's mock constructor support invokes the
// implementation via Reflect.construct, which throws on an arrow function
// (arrow functions have no [[Construct]] internal method).
vi.mock('@google-cloud/compute', () => ({
  InstancesClient: vi.fn().mockImplementation(function InstancesClient() {
    return {
      aggregatedListAsync: vi.fn(async function* () {
        for (const page of instancePages) yield page;
      }),
      close: instancesCloseMock,
    };
  }),
}));

vi.mock('@google-cloud/container', () => ({
  ClusterManagerClient: vi.fn().mockImplementation(function ClusterManagerClient() {
    return {
      listClusters: listClustersMock,
      close: clusterCloseMock,
    };
  }),
}));

const { discoverGcpResources } = await import('./discover.js');

function baseOpts(overrides: Partial<CloudDiscoveryOptions> = {}): CloudDiscoveryOptions {
  return {
    tagKey: 'purgeit-managed',
    tagValue: 'true',
    withCost: false,
    project: 'my-project',
    ...overrides,
  };
}

async function collect(opts: CloudDiscoveryOptions): Promise<CloudScanEvent[]> {
  const events: CloudScanEvent[] = [];
  for await (const event of discoverGcpResources(opts)) {
    events.push(event);
  }
  return events;
}

describe('discoverGcpResources', () => {
  afterEach(() => {
    instancePages = [];
    clustersResult = {};
    instancesCloseMock.mockClear();
    clusterCloseMock.mockClear();
    listClustersMock.mockClear();
  });

  it('requires a project id', async () => {
    await expect(collect(baseOpts({ project: undefined }))).rejects.toThrow(/--gcp-project/);
  });

  it('yields only labeled Compute Engine instances, with cost always null', async () => {
    instancePages = [
      [
        'zones/us-central1-a',
        {
          instances: [
            {
              name: 'tagged',
              labels: { 'purgeit-managed': 'true' },
              creationTimestamp: '2024-01-01T00:00:00.000-08:00',
            },
            { name: 'untagged', labels: {} },
          ],
        },
      ],
    ];
    const events = await collect(baseOpts());
    const found = events.filter((e) => e.type === 'found');
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      type: 'found',
      resource: {
        id: 'projects/my-project/zones/us-central1-a/instances/tagged',
        provider: 'gcp',
        resourceType: 'compute-instance',
        label: 'tagged',
        project: 'my-project',
        region: 'us-central1-a',
        tags: { 'purgeit-managed': 'true' },
        createdAt: Date.parse('2024-01-01T00:00:00.000-08:00'),
        cost: null,
      },
    });
    expect(instancesCloseMock).toHaveBeenCalledOnce();
  });

  it('skips an instance with no name', async () => {
    instancePages = [['zones/z', { instances: [{ labels: { 'purgeit-managed': 'true' } }] }]];
    const events = await collect(baseOpts());
    expect(events.filter((e) => e.type === 'found')).toHaveLength(0);
  });

  it('handles a zone with no instances field', async () => {
    instancePages = [['zones/empty', {}]];
    const events = await collect(baseOpts());
    expect(events.filter((e) => e.type === 'found')).toHaveLength(0);
  });

  it('records createdAt null when an instance has no creationTimestamp', async () => {
    instancePages = [
      ['zones/z', { instances: [{ name: 'x', labels: { 'purgeit-managed': 'true' } }] }],
    ];
    const events = await collect(baseOpts());
    const found = events.find((e) => e.type === 'found');
    expect(found?.type === 'found' && found.resource.createdAt).toBeNull();
  });

  it('yields only labeled GKE clusters', async () => {
    clustersResult = {
      clusters: [
        {
          name: 'tagged-cluster',
          location: 'us-central1',
          resourceLabels: { 'purgeit-managed': 'true' },
          createTime: '2024-01-01T00:00:00Z',
        },
        { name: 'untagged-cluster', location: 'us-central1', resourceLabels: {} },
      ],
    };
    const events = await collect(baseOpts());
    const found = events.filter((e) => e.type === 'found');
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      type: 'found',
      resource: {
        id: 'projects/my-project/locations/us-central1/clusters/tagged-cluster',
        provider: 'gcp',
        resourceType: 'gke-cluster',
        label: 'tagged-cluster',
        project: 'my-project',
        region: 'us-central1',
        tags: { 'purgeit-managed': 'true' },
        createdAt: Date.parse('2024-01-01T00:00:00Z'),
        cost: null,
      },
    });
    expect(clusterCloseMock).toHaveBeenCalledOnce();
  });

  it('skips a cluster missing name or location', async () => {
    clustersResult = {
      clusters: [
        { name: 'no-location', resourceLabels: { 'purgeit-managed': 'true' } },
        { location: 'us-central1', resourceLabels: { 'purgeit-managed': 'true' } },
      ],
    };
    const events = await collect(baseOpts());
    expect(events.filter((e) => e.type === 'found')).toHaveLength(0);
  });

  it('records createdAt null when a cluster has no createTime', async () => {
    clustersResult = {
      clusters: [
        { name: 'c', location: 'us-central1', resourceLabels: { 'purgeit-managed': 'true' } },
      ],
    };
    const events = await collect(baseOpts());
    const found = events.find((e) => e.type === 'found');
    expect(found?.type === 'found' && found.resource.createdAt).toBeNull();
  });

  it('stops mid-cluster-list once aborted', async () => {
    clustersResult = {
      clusters: [
        {
          name: 'first',
          location: 'us-central1',
          resourceLabels: { 'purgeit-managed': 'true' },
        },
        {
          name: 'second',
          location: 'us-central1',
          resourceLabels: { 'purgeit-managed': 'true' },
        },
      ],
    };
    const controller = new AbortController();
    const events: CloudScanEvent[] = [];
    for await (const event of discoverGcpResources(baseOpts({ signal: controller.signal }))) {
      events.push(event);
      if (event.type === 'found') controller.abort();
    }
    expect(events.filter((e) => e.type === 'found')).toHaveLength(1);
  });

  it('handles no clusters field at all', async () => {
    clustersResult = {};
    const events = await collect(baseOpts());
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('stops immediately when passed an already-aborted signal, without listing clusters', async () => {
    instancePages = [
      ['zones/z', { instances: [{ name: 'x', labels: { 'purgeit-managed': 'true' } }] }],
    ];
    const controller = new AbortController();
    controller.abort();
    const events = await collect(baseOpts({ signal: controller.signal }));
    expect(events).toEqual([{ type: 'done' }]);
    expect(listClustersMock).not.toHaveBeenCalled();
  });

  it('stops mid-instance-list once aborted, without listing clusters', async () => {
    instancePages = [
      [
        'zones/z',
        {
          instances: [
            { name: 'first', labels: { 'purgeit-managed': 'true' } },
            { name: 'second', labels: { 'purgeit-managed': 'true' } },
          ],
        },
      ],
    ];
    const controller = new AbortController();
    const events: CloudScanEvent[] = [];
    for await (const event of discoverGcpResources(baseOpts({ signal: controller.signal }))) {
      events.push(event);
      if (event.type === 'found') controller.abort();
    }
    expect(events.filter((e) => e.type === 'found')).toHaveLength(1);
    expect(listClustersMock).not.toHaveBeenCalled();
  });
});
