import type { CloudProvider } from '../types.js';
import { deleteAwsResources } from './delete.js';
import { discoverAwsResources } from './discover.js';

export function createAwsProvider(): CloudProvider {
  return {
    id: 'aws',
    discover: discoverAwsResources,
    delete: deleteAwsResources,
  };
}
