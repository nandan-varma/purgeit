import type { CloudDeleteEvent, CloudDeleteOptions, CloudResource } from '../types.js';
import { loadCloudFormationSdk } from './sdk-loader.js';

/**
 * Deletes each stack in turn (CloudFormation's DeleteStack accepts either a
 * stack name or its ARN — `resource.id`, the ARN, is used since it's always
 * unique and stable). Mirrors delete/deleter.ts's event shape and
 * one-bad-resource-doesn't-abort-the-batch semantics; unlike a local
 * directory a deleted stack is frequently not regenerable, which is why the
 * TUI requires a stronger, typed confirmation before this is ever reached
 * for a cloud selection (see ui/components/ConfirmDialog.tsx).
 */
export async function* deleteAwsResources(
  resources: readonly CloudResource[],
  opts: CloudDeleteOptions,
): AsyncGenerator<CloudDeleteEvent> {
  let deleted = 0;
  let failed = 0;

  if (opts.signal?.aborted) {
    yield { type: 'done', deleted, failed };
    return;
  }

  const sdk = await loadCloudFormationSdk();
  const region = resources[0]?.region;
  const client = new sdk.CloudFormationClient(
    region !== undefined && region !== null ? { region } : {},
  );

  try {
    for (const resource of resources) {
      if (opts.signal?.aborted) break;
      yield { type: 'deleting', id: resource.id };
      try {
        if (!opts.dryRun) {
          await client.send(new sdk.DeleteStackCommand({ StackName: resource.id }));
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
    client.destroy();
  }

  yield { type: 'done', deleted, failed };
}
