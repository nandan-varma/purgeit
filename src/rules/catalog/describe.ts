import type { GateCondition } from '../../config/schema.js';
import type { RuleDefinition } from './types.js';

/** Short label per rule kind, shared by the docs site's rule table and `purgeit docs rules`. */
export const KIND_LABELS: Readonly<Record<RuleDefinition['kind'], string>> = {
  'always-safe': 'safe',
  gated: 'gated',
  marker: 'tagged',
  'prune-meta': 'pruned',
};

/** Display order of rule kinds within a category. */
export const KIND_ORDER: Readonly<Record<RuleDefinition['kind'], number>> = {
  'always-safe': 0,
  gated: 1,
  marker: 2,
  'prune-meta': 3,
};

function describeCondition(condition: GateCondition): string {
  if ('file' in condition) return condition.file;
  if ('glob' in condition) return condition.glob;
  return `${condition.grep.file} (matching /${condition.grep.pattern}/)`;
}

/** A gated rule's `when`, as prose: "Podfile or *.xcodeproj". */
export function describeWhen(when: GateCondition | readonly GateCondition[]): string {
  const list: readonly GateCondition[] = Array.isArray(when) ? when : [when as GateCondition];
  return list.map(describeCondition).join(' or ');
}
