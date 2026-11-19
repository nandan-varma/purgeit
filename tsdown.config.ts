import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli/main.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: true,
  clean: true,
  loader: { '.md': 'text' },
  define: { __VERSION__: JSON.stringify(pkg.version) },
});
