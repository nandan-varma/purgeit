import data from '@/generated/rules.json';

import { RulesBrowser } from './rules-browser';

/** The built-in rule catalog, from the code (see `bun run generate`). */
export function RulesTable() {
  return <RulesBrowser rules={data.rules} categories={data.categories} />;
}
