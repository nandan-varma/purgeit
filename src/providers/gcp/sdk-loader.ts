import type * as ComputeSdk from '@google-cloud/compute';
import type * as ContainerSdk from '@google-cloud/container';

const INSTALL_HINT =
  'GCP support requires the GCP client libraries — run: npm install @google-cloud/compute @google-cloud/container';

async function loadOptionalGcpSdk<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    throw new Error(`purgeit: ${INSTALL_HINT}`, { cause: err });
  }
}

let computeSdk: typeof ComputeSdk | undefined;

/** Dynamically imports @google-cloud/compute — an optional peer dependency, never loaded for a local-only scan. */
export async function loadComputeSdk(): Promise<typeof ComputeSdk> {
  computeSdk ??= await loadOptionalGcpSdk(() => import('@google-cloud/compute'));
  return computeSdk;
}

let containerSdk: typeof ContainerSdk | undefined;

/** Dynamically imports @google-cloud/container — an optional peer dependency, never loaded for a local-only scan. */
export async function loadContainerSdk(): Promise<typeof ContainerSdk> {
  containerSdk ??= await loadOptionalGcpSdk(() => import('@google-cloud/container'));
  return containerSdk;
}
