import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ConfigSchema } from '../src/config/schema.js';

/** The JSON Schema editors use to complete and validate purgeit.config.json. */
export function buildSchema(): string {
  const schema = z.toJSONSchema(ConfigSchema, { io: 'input' });
  return `${JSON.stringify({ title: 'purgeit configuration', ...schema }, null, 2)}\n`;
}

if (process.argv[1]?.endsWith('schema.ts')) {
  writeFileSync(new URL('../purgeit.schema.json', import.meta.url), buildSchema());
}
