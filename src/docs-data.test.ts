import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { buildDocsData, generatedDir } from '../scripts/docs-data.js';

it('keeps docs/src/generated in step with the code (run `bun run generate`)', () => {
  for (const [name, content] of Object.entries(buildDocsData())) {
    expect(readFileSync(new URL(name, generatedDir), 'utf8'), name).toBe(content);
  }
});
