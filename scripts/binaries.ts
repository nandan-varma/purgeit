// Builds standalone executables (no Node needed) from dist/cli.mjs with Bun's compiler.
// Usage: bun scripts/binaries.ts [target…]   targets: linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ALL = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'windows-x64'] as const;
const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : ALL;
const outDir = fileURLToPath(new URL('../release/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const target of targets) {
  if (!ALL.some((known) => known === target)) {
    throw new Error(`Unknown target "${target}" — choose from ${ALL.join(', ')}`);
  }
  const outfile = `${outDir}purgeit-${target}${target.startsWith('windows') ? '.exe' : ''}`;
  const result = spawnSync(
    'bun',
    [
      'build',
      '--compile',
      '--minify',
      '--define',
      'process.env.NODE_ENV="production"',
      `--target=bun-${target}`,
      'dist/cli.mjs',
      '--outfile',
      outfile,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0)
    throw new Error(`bun build failed for ${target} (exit ${result.status})`);
  console.log(`built ${outfile}`);
}
