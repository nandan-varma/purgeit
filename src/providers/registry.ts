import type { CloudProvider, CloudProviderId } from './types.js';

/**
 * Dynamically imports the requested provider's implementation — the AWS/GCP
 * SDKs are optional peerDependencies, so a plain local scan (the overwhelming
 * majority of invocations) never loads or requires either of them.
 */
export async function loadProvider(id: CloudProviderId): Promise<CloudProvider> {
  if (id === 'aws') {
    const { createAwsProvider } = await import('./aws/provider.js');
    return createAwsProvider();
  }
  throw new Error(`purgeit: cloud provider '${id}' is not yet supported`);
}
