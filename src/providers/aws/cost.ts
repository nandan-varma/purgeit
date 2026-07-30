import type { CostEstimate } from '../types.js';
import { loadCostExplorerSdk } from './sdk-loader.js';

const LOOKBACK_DAYS = 30;
/** CloudFormation auto-tags every resource it creates with this cost allocation tag — activating it in Billing lets Cost Explorer group real spend by stack name in a single batched call, rather than one call per stack. */
const STACK_NAME_COST_TAG = 'aws:cloudformation:stack-name';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches the last 30 days' billed cost for each of `stackNames` in one
 * batched Cost Explorer call, grouped by the `aws:cloudformation:stack-name`
 * cost allocation tag. Returns only the stacks Cost Explorer actually has
 * data for — a stack with no billed cost data (e.g. the tag isn't activated
 * as a cost allocation tag in this account's Billing settings, or the stack
 * is brand new) simply won't appear in the result.
 */
export async function fetchAwsStackCosts(
  stackNames: readonly string[],
  opts: { readonly region?: string | undefined },
): Promise<Map<string, CostEstimate>> {
  const costs = new Map<string, CostEstimate>();
  if (stackNames.length === 0) return costs;

  const sdk = await loadCostExplorerSdk();
  const client = new sdk.CostExplorerClient(
    opts.region !== undefined ? { region: opts.region } : {},
  );
  try {
    const end = new Date();
    const start = new Date(end.getTime() - LOOKBACK_DAYS * 86_400_000);
    const response = await client.send(
      new sdk.GetCostAndUsageCommand({
        TimePeriod: { Start: isoDate(start), End: isoDate(end) },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'TAG', Key: STACK_NAME_COST_TAG }],
      }),
    );

    const wanted = new Set(stackNames);
    for (const result of response.ResultsByTime ?? []) {
      for (const group of result.Groups ?? []) {
        const rawKey = group.Keys?.[0];
        const amountStr = group.Metrics?.UnblendedCost?.Amount;
        if (rawKey === undefined || amountStr === undefined) continue;
        // Cost Explorer's tag group keys look like "aws:cloudformation:stack-name$my-stack".
        const stackName = rawKey.slice(rawKey.indexOf('$') + 1);
        if (!wanted.has(stackName)) continue;
        const amountUsd = Number.parseFloat(amountStr);
        if (!Number.isFinite(amountUsd)) continue;
        const existing = costs.get(stackName);
        costs.set(stackName, {
          amountUsd: (existing?.amountUsd ?? 0) + amountUsd,
          basis: 'billed',
        });
      }
    }
  } finally {
    client.destroy();
  }
  return costs;
}
