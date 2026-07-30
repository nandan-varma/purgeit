import type * as CloudFormationSdk from '@aws-sdk/client-cloudformation';
import type * as CostExplorerSdk from '@aws-sdk/client-cost-explorer';

const INSTALL_HINT =
  'AWS support requires the AWS SDK — run: npm install @aws-sdk/client-cloudformation @aws-sdk/client-cost-explorer';

async function loadOptionalAwsSdk<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    throw new Error(`purgeit: ${INSTALL_HINT}`, { cause: err });
  }
}

let cloudFormationSdk: typeof CloudFormationSdk | undefined;

/** Dynamically imports @aws-sdk/client-cloudformation — an optional peer dependency, never loaded for a local-only scan. */
export async function loadCloudFormationSdk(): Promise<typeof CloudFormationSdk> {
  cloudFormationSdk ??= await loadOptionalAwsSdk(() => import('@aws-sdk/client-cloudformation'));
  return cloudFormationSdk;
}

let costExplorerSdk: typeof CostExplorerSdk | undefined;

/** Dynamically imports @aws-sdk/client-cost-explorer — only needed when --with-cost is passed. */
export async function loadCostExplorerSdk(): Promise<typeof CostExplorerSdk> {
  costExplorerSdk ??= await loadOptionalAwsSdk(() => import('@aws-sdk/client-cost-explorer'));
  return costExplorerSdk;
}
