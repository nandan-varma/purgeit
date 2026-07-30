import type { CloudProvider } from '../types.js';
import { deleteGcpResources } from './delete.js';
import { discoverGcpResources } from './discover.js';

export function createGcpProvider(): CloudProvider {
  return {
    id: 'gcp',
    discover: discoverGcpResources,
    delete: deleteGcpResources,
  };
}
