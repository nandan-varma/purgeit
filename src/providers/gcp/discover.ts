import type { CloudDiscoveryOptions, CloudResource, CloudScanEvent } from '../types.js';
import { loadComputeSdk, loadContainerSdk } from './sdk-loader.js';

function labelsMatch(
  labels: Readonly<Record<string, string>> | null | undefined,
  key: string,
  value: string,
): boolean {
  return labels?.[key] === value;
}

/**
 * Discovers Compute Engine instances (via `aggregatedListAsync`, which
 * covers every zone in the project in one call) and GKE clusters (via
 * `listClusters` with `locations/-`, covering every location) labeled with
 * the configured key/value. Unlike the AWS provider, GCP always discovers
 * across the whole project rather than one region per call — GCP's own
 * APIs make that the natural, cheap default (no per-region looping needed),
 * whereas CloudFormation has no equivalent "every region" list call.
 * Cost is always null for GCP resources this release — see cost.ts's
 * absence: GCP has no Cost-Explorer-shaped API for a quick per-resource
 * estimate, and a real one would need paginating the full Billing Catalog
 * SKU list plus per-machine-type lookups, deferred until it can be
 * verified against a real GCP billing account.
 */
export async function* discoverGcpResources(
  opts: CloudDiscoveryOptions,
): AsyncGenerator<CloudScanEvent> {
  if (opts.project === undefined) {
    throw new Error(
      'purgeit: --gcp-project (or cloud.gcp.project in config) is required for --provider gcp',
    );
  }
  const project = opts.project;
  const computeSdk = await loadComputeSdk();
  const containerSdk = await loadContainerSdk();

  const instancesClient = new computeSdk.InstancesClient();
  try {
    for await (const [zoneKey, scopedList] of instancesClient.aggregatedListAsync({ project })) {
      if (opts.signal?.aborted) break;
      for (const instance of scopedList.instances ?? []) {
        if (opts.signal?.aborted) break;
        if (instance.name === undefined || instance.name === null) continue;
        if (!labelsMatch(instance.labels, opts.tagKey, opts.tagValue)) continue;

        const zone = zoneKey.slice(zoneKey.lastIndexOf('/') + 1);
        const resource: CloudResource = {
          id: `projects/${project}/zones/${zone}/instances/${instance.name}`,
          provider: 'gcp',
          resourceType: 'compute-instance',
          label: instance.name,
          project,
          region: zone,
          // labelsMatch above already guarantees instance.labels is defined.
          tags: instance.labels as Record<string, string>,
          createdAt: instance.creationTimestamp ? Date.parse(instance.creationTimestamp) : null,
          cost: null,
        };
        yield { type: 'found', resource };
      }
    }
  } finally {
    await instancesClient.close();
  }

  if (!opts.signal?.aborted) {
    const clusterClient = new containerSdk.ClusterManagerClient();
    try {
      const [response] = await clusterClient.listClusters({
        parent: `projects/${project}/locations/-`,
      });
      for (const cluster of response.clusters ?? []) {
        if (opts.signal?.aborted) break;
        if (
          cluster.name === undefined ||
          cluster.name === null ||
          cluster.location === undefined ||
          cluster.location === null
        )
          continue;
        if (!labelsMatch(cluster.resourceLabels, opts.tagKey, opts.tagValue)) continue;

        const resource: CloudResource = {
          id: `projects/${project}/locations/${cluster.location}/clusters/${cluster.name}`,
          provider: 'gcp',
          resourceType: 'gke-cluster',
          label: cluster.name,
          project,
          region: cluster.location,
          // labelsMatch above already guarantees cluster.resourceLabels is defined.
          tags: cluster.resourceLabels as Record<string, string>,
          createdAt: cluster.createTime ? Date.parse(cluster.createTime) : null,
          cost: null,
        };
        yield { type: 'found', resource };
      }
    } finally {
      await clusterClient.close();
    }
  }

  yield { type: 'done' };
}
