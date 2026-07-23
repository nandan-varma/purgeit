import { compileGateConditions } from '../config/schema.js';
import type { Gate } from '../types.js';
import { RULE_CATALOG } from './catalog/index.js';
import type { GatedRuleDefinition } from './catalog/types.js';

function isGatedRule(rule: (typeof RULE_CATALOG)[number]): rule is GatedRuleDefinition {
  return rule.kind === 'gated';
}

/**
 * Default GATED_NAMES → Gate mapping, compiled from each gated rule's
 * declarative `when` condition in RULE_CATALOG (see `catalog/*.ts`). Using
 * the same declarative `GateCondition` shape user configs use means the
 * built-in gates are compiled through the exact same code path as
 * user-defined ones, and stay introspectable for docs instead of living
 * only as opaque closures.
 */
export const DEFAULT_GATES: ReadonlyMap<string, Gate> = new Map(
  RULE_CATALOG.filter(isGatedRule).map((rule) => [rule.name, compileGateConditions(rule.when)]),
);
