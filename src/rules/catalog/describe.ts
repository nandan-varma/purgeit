import type { RuleDefinition } from './types.js';

/** Short label per rule kind, shared by the docs site's rule table and `purgeit rules`. */
export const KIND_LABELS: Readonly<Record<RuleDefinition['kind'], string>> = {
  safe: 'safe',
  gated: 'gated',
  marker: 'tagged',
  ignore: 'pruned',
};

/** Display order of rule kinds within a category. */
export const KIND_ORDER: Readonly<Record<RuleDefinition['kind'], number>> = {
  safe: 0,
  gated: 1,
  marker: 2,
  ignore: 3,
};
