import type { CloudDiscoveryOptions, CloudResource, CloudScanEvent } from '../types.js';
import { fetchAwsStackCosts } from './cost.js';
import { loadCloudFormationSdk } from './sdk-loader.js';

interface RawTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

function tagsMatch(
  tags: readonly RawTag[] | undefined,
  required: ReadonlyMap<string, string>,
): boolean {
  const list = tags ?? [];
  for (const [key, value] of required) {
    if (!list.some((t) => t.Key === key && t.Value === value)) return false;
  }
  return true;
}

/** Only ever called with a stack's Tags after tagsMatch confirmed a match, which is impossible for undefined/empty tags — so unlike tagsMatch, no `?? []` fallback is needed here. */
function toTagRecord(tags: readonly RawTag[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const tag of tags) {
    if (tag.Key !== undefined && tag.Value !== undefined) record[tag.Key] = tag.Value;
  }
  return record;
}

/**
 * Discovers CloudFormation stacks carrying every one of `opts.tags`' key/
 * value pairs (AND semantics), one AWS region per call (from `opts.region`,
 * else the SDK's own default
 * region resolution — CloudFormation has no single "list stacks in every
 * region" API, unlike GCP's aggregatedList/wildcard-location calls).
 * `--aws-profile` is applied via `AWS_PROFILE` so the SDK's own default
 * credential chain resolves it — purgeit never handles credentials itself.
 */
export async function* discoverAwsResources(
  opts: CloudDiscoveryOptions,
): AsyncGenerator<CloudScanEvent> {
  if (opts.tags.size === 0) {
    throw new Error(
      'purgeit: at least one --tag (or cloud.tagKey/tagValue in config) is required for cloud discovery',
    );
  }
  const sdk = await loadCloudFormationSdk();
  if (opts.profile !== undefined) process.env.AWS_PROFILE = opts.profile;
  const client = new sdk.CloudFormationClient(
    opts.region !== undefined ? { region: opts.region } : {},
  );

  const matched: CloudResource[] = [];
  try {
    let nextToken: string | undefined;
    do {
      if (opts.signal?.aborted) break;
      const response = await client.send(
        new sdk.DescribeStacksCommand(nextToken !== undefined ? { NextToken: nextToken } : {}),
      );
      for (const stack of response.Stacks ?? []) {
        if (opts.signal?.aborted) break;
        if (stack.StackId === undefined || stack.StackName === undefined) continue;
        if (!tagsMatch(stack.Tags, opts.tags)) continue;

        const resource: CloudResource = {
          id: stack.StackId,
          provider: 'aws',
          resourceType: 'cloudformation-stack',
          label: stack.StackName,
          project: opts.region ?? 'default',
          region: opts.region ?? null,
          // tagsMatch above already guarantees stack.Tags is defined and non-empty.
          tags: toTagRecord(stack.Tags as RawTag[]),
          createdAt: stack.CreationTime ? stack.CreationTime.getTime() : null,
          cost: null,
        };
        matched.push(resource);
        yield { type: 'found', resource };
      }
      nextToken = response.NextToken;
    } while (nextToken !== undefined && !opts.signal?.aborted);
  } finally {
    client.destroy();
  }

  if (opts.withCost && matched.length > 0 && !opts.signal?.aborted) {
    const costs = await fetchAwsStackCosts(
      matched.map((r) => r.label),
      { region: opts.region },
    );
    for (const resource of matched) {
      const cost = costs.get(resource.label);
      if (cost !== undefined) {
        yield { type: 'cost', id: resource.id, cost };
      }
    }
  }

  yield { type: 'done' };
}
