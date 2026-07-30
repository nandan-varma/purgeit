/**
 * The cloud resource domain, parallel to (but deliberately not unified
 * with) the local filesystem domain in scan/scanner.ts and delete/deleter.ts.
 * Bytes-vs-dollars and path-vs-ARN are different enough concepts that
 * forcing them into one shared type would hide real differences rather than
 * simplify anything — unification happens one layer up, at display time
 * (see ui/state.ts's DisplayEntry), not here.
 */

export type CloudProviderId = 'aws' | 'gcp';

export interface CostEstimate {
  readonly amountUsd: number;
  /**
   * 'billed' — a real number from the provider's own cost/billing API (AWS
   * Cost Explorer). 'list-price-estimate' — an on-demand list-price
   * approximation with no discounts applied (GCP, which has no
   * Cost-Explorer-shaped API for this) — always surfaced as such, never
   * presented as if it were a billed figure.
   */
  readonly basis: 'billed' | 'list-price-estimate';
}

export interface CloudResource {
  /** Stable unique key: an ARN (AWS) or a fully-qualified resource name (GCP). */
  readonly id: string;
  readonly provider: CloudProviderId;
  /** e.g. 'cloudformation-stack' (AWS), 'compute-instance' | 'gke-cluster' (GCP). */
  readonly resourceType: string;
  readonly label: string;
  /** Grouping key for display: AWS account/region, or GCP project id. */
  readonly project: string;
  readonly region: string | null;
  readonly tags: Readonly<Record<string, string>>;
  readonly createdAt: number | null;
  readonly cost: CostEstimate | null;
}

export interface CloudDiscoveryOptions {
  readonly region?: string | undefined;
  /** AWS credential profile name. */
  readonly profile?: string | undefined;
  /** GCP project id. */
  readonly project?: string | undefined;
  /** All of these key/value pairs must be present on a resource for it to match (AND semantics). */
  readonly tags: ReadonlyMap<string, string>;
  /** Fetch cost data during discovery — opt-in, since it's extra API calls with their own latency/permissions. */
  readonly withCost: boolean;
  readonly signal?: AbortSignal | undefined;
}

export type CloudScanEvent =
  | { readonly type: 'found'; readonly resource: CloudResource }
  | { readonly type: 'cost'; readonly id: string; readonly cost: CostEstimate }
  | { readonly type: 'done' };

export interface CloudDeleteOptions {
  readonly dryRun?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
}

export type CloudDeleteEvent =
  | { readonly type: 'deleting'; readonly id: string }
  | { readonly type: 'deleted'; readonly id: string; readonly dryRun: boolean }
  | { readonly type: 'error'; readonly id: string; readonly message: string }
  | { readonly type: 'done'; readonly deleted: number; readonly failed: number };

/** One concrete cloud backend (AWS, GCP, ...) implements this to plug into the shared CLI/TUI report-delete flow. */
export interface CloudProvider {
  readonly id: CloudProviderId;
  discover(opts: CloudDiscoveryOptions): AsyncGenerator<CloudScanEvent>;
  delete(
    resources: readonly CloudResource[],
    opts: CloudDeleteOptions,
  ): AsyncGenerator<CloudDeleteEvent>;
}
