import type { Condition, When } from '../condition.js';
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

export function describeCondition(condition: Condition): string {
  if ('file' in condition) return condition.file;
  if ('glob' in condition) return condition.glob;
  return `${condition.grep.file} matching /${condition.grep.pattern}/`;
}

const isList = (when: When | readonly Condition[]): when is readonly Condition[] =>
  Array.isArray(when);

/** A `when` — one condition or a list — as a list. */
export const toConditions = (when: When | readonly Condition[]): readonly Condition[] =>
  isList(when) ? when : [when];

/** A `when` as prose: "Podfile or *.xcodeproj". */
export function describeWhen(when: When | readonly Condition[]): string {
  return toConditions(when).map(describeCondition).join(' or ');
}
