import { loadConfig } from '../config/resolve.js';
import { formatDuration, formatErrorMessage, parseDuration } from '../format.js';
import { loadProvider } from '../providers/registry.js';
import type { CloudResource } from '../providers/types.js';
import type { ParsedCli } from './args.js';
import type { HeadlessIO } from './headless.js';
import { confirmAndDelete, defaultConfirm } from './report.js';

const DEFAULT_TAG_KEY = 'purgeit-managed';
const DEFAULT_TAG_VALUE = 'true';

function resolveTags(
  parsed: ParsedCli,
  cloudConfig: { tagKey?: string; tagValue?: string } | undefined,
): Map<string, string> {
  if (parsed.tags.length > 0) {
    return new Map(parsed.tags.map((t) => [t.key, t.value] as const));
  }
  if (cloudConfig?.tagKey !== undefined || cloudConfig?.tagValue !== undefined) {
    return new Map([
      [cloudConfig.tagKey ?? DEFAULT_TAG_KEY, cloudConfig.tagValue ?? DEFAULT_TAG_VALUE],
    ]);
  }
  return new Map([[DEFAULT_TAG_KEY, DEFAULT_TAG_VALUE]]);
}

function sortResources(
  resources: CloudResource[],
  sortKey: ParsedCli['sort'],
  ascending: boolean,
): CloudResource[] {
  const dir = ascending ? 1 : -1;
  return [...resources].sort((a, b) => {
    if (sortKey === 'size') return dir * ((a.cost?.amountUsd ?? 0) - (b.cost?.amountUsd ?? 0));
    if (sortKey === 'name') return dir * a.label.localeCompare(b.label);
    return dir * a.id.localeCompare(b.id);
  });
}

function formatCost(cost: CloudResource['cost']): string {
  if (cost === null) return '     ?';
  const suffix = cost.basis === 'list-price-estimate' ? ' (est.)' : '';
  return `$${cost.amountUsd.toFixed(2)}${suffix}`;
}

/**
 * Runs purgeit's non-interactive cloud path — the --provider aws|gcp
 * counterpart to headless.ts's local scan. Resolves cloud settings (tag
 * filter, region/profile/project) from CLI flags with config fallback,
 * discovers via the requested CloudProvider, applies --min-age/--max-age
 * against each resource's createdAt, then reports (--json or a text
 * preview) or deletes (--delete, confirming unless --yes) through the same
 * confirmAndDelete tail as the local path (see report.ts).
 */
export async function runHeadlessCloud(parsed: ParsedCli, io: HeadlessIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const confirm = io.confirm ?? defaultConfirm;

  let minAgeMs: number | undefined;
  let maxAgeMs: number | undefined;
  try {
    if (parsed.minAge !== undefined) minAgeMs = parseDuration(parsed.minAge);
    if (parsed.maxAge !== undefined) maxAgeMs = parseDuration(parsed.maxAge);
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

  let loaded: Awaited<ReturnType<typeof loadConfig>>;
  try {
    loaded = await loadConfig({
      cwd: io.cwd ?? process.cwd(),
      configPath: parsed.configPath,
      noConfig: parsed.noConfig,
    });
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
  const cloudConfig = loaded.config?.cloud;

  if (parsed.provider === 'local') {
    throw new Error('purgeit: internal error — runHeadlessCloud called with provider "local"');
  }
  const providerId = parsed.provider;
  let provider: Awaited<ReturnType<typeof loadProvider>>;
  try {
    provider = await loadProvider(providerId);
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

  const found: CloudResource[] = [];
  const costs = new Map<string, NonNullable<CloudResource['cost']>>();
  try {
    for await (const event of provider.discover({
      region: parsed.region ?? cloudConfig?.aws?.region,
      profile: parsed.awsProfile ?? cloudConfig?.aws?.profile,
      project: parsed.gcpProject ?? cloudConfig?.gcp?.project,
      tags: resolveTags(parsed, cloudConfig),
      withCost: parsed.withCost,
      signal: io.signal,
    })) {
      if (event.type === 'found') found.push(event.resource);
      else if (event.type === 'cost') costs.set(event.id, event.cost);
    }
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

  // costs.has(r.id) already guarantees costs.get(r.id) is defined.
  const withCost = found.map((r) =>
    costs.has(r.id) ? { ...r, cost: costs.get(r.id) as NonNullable<CloudResource['cost']> } : r,
  );

  const passesAge = (resource: CloudResource): boolean => {
    if (minAgeMs === undefined && maxAgeMs === undefined) return true;
    if (resource.createdAt === null) return false;
    const age = Date.now() - resource.createdAt;
    if (minAgeMs !== undefined && age < minAgeMs) return false;
    if (maxAgeMs !== undefined && age > maxAgeMs) return false;
    return true;
  };
  const filtered = sortResources(withCost.filter(passesAge), parsed.sort, parsed.ascending);

  if (parsed.json) {
    stdout(
      JSON.stringify(
        {
          provider: providerId,
          entries: filtered.map((r) => ({
            id: r.id,
            provider: r.provider,
            resourceType: r.resourceType,
            label: r.label,
            project: r.project,
            region: r.region,
            tags: r.tags,
            createdAt: r.createdAt,
            cost: r.cost,
          })),
        },
        null,
        2,
      ),
    );
    return filtered.length === 0 ? 1 : 0;
  }

  if (filtered.length === 0) {
    stdout('Nothing to clean.');
    return 1;
  }

  for (const resource of filtered) {
    const age = resource.createdAt === null ? '?' : formatDuration(Date.now() - resource.createdAt);
    stdout(
      `${formatCost(resource.cost).padStart(12)}  ${resource.resourceType.padEnd(20)}  ${age.padStart(6)}  ${resource.label}  (${resource.id})`,
    );
  }
  stdout('');
  stdout(`${filtered.length} resource(s)`);

  if (!parsed.delete) {
    stdout('Run with --delete to actually delete.');
    return 0;
  }

  return confirmAndDelete(
    { stdout, stderr, confirm },
    {
      confirmQuestion: `Delete ${filtered.length} resource(s)? This is frequently NOT regenerable.`,
      yes: parsed.yes,
    },
    async function* () {
      for await (const event of provider.delete(filtered, {
        signal: io.signal,
        dryRun: parsed.dryRun,
      })) {
        if (event.type === 'deleting') yield { type: 'deleting', key: event.id };
        else if (event.type === 'deleted')
          yield { type: 'deleted', key: event.id, dryRun: event.dryRun };
        else if (event.type === 'error')
          yield { type: 'error', key: event.id, message: event.message };
        else yield { type: 'done', deleted: event.deleted, failed: event.failed };
      }
    },
  );
}
