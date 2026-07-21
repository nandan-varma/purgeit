import { buildTree } from './build-tmp-tree.js';

const root = buildTree({
  proj: { node_modules: { f: 'x'.repeat(1000) }, dist: { f: 'y'.repeat(500) } },
  ios: { Podfile: 'platform :ios\n', Pods: { dummy: 'x' } },
});

process.stdout.write(root);
