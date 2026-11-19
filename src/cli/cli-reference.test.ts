import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { buildCliReference } from '../../scripts/cli-reference.js';

it('keeps docs/src/generated/cli.json in step with the CLI (run `bun run generate`)', () => {
  const shipped = readFileSync(
    new URL('../../docs/src/generated/cli.json', import.meta.url),
    'utf8',
  );
  expect(shipped).toBe(buildCliReference());
});
