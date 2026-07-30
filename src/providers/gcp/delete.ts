import type { CloudDeleteEvent, CloudDeleteOptions, CloudResource } from '../types.js';
import { loadComputeSdk, loadContainerSdk } from './sdk-loader.js';

/** Parses the `projects/{project}/zones/{zone}/instances/{instance}` id discover.ts constructs. */
function parseInstanceId(id: string): { project: string; zone: string; instance: string } {
  const parts = id.split('/');
  return { project: parts[1] as string, zone: parts[3] as string, instance: parts[5] as string };
}

/**
 * Deletes each resource in turn — Compute Engine instances via
 * InstancesClient.delete (which needs project/zone/instance name
 * separately, unlike GKE), GKE clusters via ClusterManagerClient's
 * `name`-based deleteCluster (which accepts the full resource path
 * directly, matching `resource.id`'s shape). Mirrors delete/deleter.ts's
 * event shape and one-bad-resource-doesn't-abort-the-batch semantics.
 */
export async function* deleteGcpResources(
  resources: readonly CloudResource[],
  opts: CloudDeleteOptions,
): AsyncGenerator<CloudDeleteEvent> {
  let deleted = 0;
  let failed = 0;

  if (opts.signal?.aborted) {
    yield { type: 'done', deleted, failed };
    return;
  }

  const computeSdk = await loadComputeSdk();
  const containerSdk = await loadContainerSdk();
  const instancesClient = new computeSdk.InstancesClient();
  const clusterClient = new containerSdk.ClusterManagerClient();

  try {
    for (const resource of resources) {
      if (opts.signal?.aborted) break;
      yield { type: 'deleting', id: resource.id };
      try {
        if (!opts.dryRun) {
          if (resource.resourceType === 'compute-instance') {
            await instancesClient.delete(parseInstanceId(resource.id));
          } else {
            await clusterClient.deleteCluster({ name: resource.id });
          }
        }
        deleted++;
        yield { type: 'deleted', id: resource.id, dryRun: opts.dryRun ?? false };
      } catch (err) {
        failed++;
        yield {
          type: 'error',
          id: resource.id,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
  } finally {
    await instancesClient.close();
    await clusterClient.close();
  }

  yield { type: 'done', deleted, failed };
}
