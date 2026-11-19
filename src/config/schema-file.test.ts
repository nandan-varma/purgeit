import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { buildSchema } from '../../scripts/schema.js';

it('ships a purgeit.schema.json that matches the config schema (run `npm run schema`)', () => {
  const shipped = readFileSync(new URL('../../purgeit.schema.json', import.meta.url), 'utf8');
  expect(shipped).toBe(buildSchema());
});
