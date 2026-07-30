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
  const { createGcpProvider } = await import('./gcp/provider.js');
  return createGcpProvider();
}
