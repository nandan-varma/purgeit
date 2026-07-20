import type { PurgeitUserConfig } from '../config/schema.js';
import { compileGateConditions, isDeclarativeGatedRule } from '../config/schema.js';
import type { Gate, ResolvedRuleSet } from '../types.js';
import { ALWAYS_SAFE_NAMES, GATED_NAMES, PRUNE_META_NAMES } from './default-rules.js';
import { DEFAULT_GATES } from './gate-conditions.js';

/**
 * The built-in ruleset (CLEANUP.sh's defaults, ported). `skipDirs` starts
 * empty — CLEANUP.sh's own SKIP_DIRS list named this user's personal
 * top-level folders (Claude, Snippets, memory, ...), which has no place as a
 * default in a published package; users add their own via `skipDirs` in
 * their config.
 */
export function defaultRuleSet(): ResolvedRuleSet {
  return {
    alwaysSafe: new Set(ALWAYS_SAFE_NAMES),
    gated: new Map(DEFAULT_GATES),
    pruneMeta: new Set(PRUNE_META_NAMES),
    skipDirs: new Set(),
    targets: new Map(),
  };
}

/** Sanity check: every GATED_NAMES entry has a default gate. */
for (const name of GATED_NAMES) {
  /* v8 ignore next 3 -- static invariant over hardcoded data; never actually false */
  if (!DEFAULT_GATES.has(name)) {
    throw new Error(`purgeit: GATED_NAMES entry '${name}' has no matching gate in DEFAULT_GATES`);
  }
}

/**
 * Layers a user config on top of (or, with `extends: 'replace'`, instead of)
 * the built-in ruleset. Always-safe wins over gated when a name appears in
 * both (a stronger guarantee should never be silently downgraded).
 */
export function mergeRuleSets(
  base: ResolvedRuleSet,
  config: PurgeitUserConfig | undefined,
): ResolvedRuleSet {
  if (!config) return base;

  const replacing = config.extends === 'replace';
  const alwaysSafe = replacing ? new Set<string>() : new Set(base.alwaysSafe);
  const gated = replacing ? new Map<string, Gate>() : new Map(base.gated);
  const pruneMeta = replacing ? new Set<string>() : new Set(base.pruneMeta);
  const skipDirs = replacing ? new Set<string>() : new Set(base.skipDirs);
  const targets = replacing ? new Map<string, readonly string[]>() : new Map(base.targets);

  for (const name of config.alwaysSafe ?? []) alwaysSafe.add(name);
  for (const name of config.alwaysSafeRemove ?? []) alwaysSafe.delete(name);

  for (const rule of config.gated ?? []) {
    const gate = isDeclarativeGatedRule(rule) ? compileGateConditions(rule.when) : rule.gate;
    gated.set(rule.name, gate);
  }
  for (const name of config.gatedRemove ?? []) gated.delete(name);

  // Always-safe is the stronger guarantee — a name can't be both.
  for (const name of alwaysSafe) gated.delete(name);

  for (const name of config.skipDirs ?? []) skipDirs.add(name);
  for (const name of config.pruneNames ?? []) pruneMeta.add(name);
  for (const [key, values] of Object.entries(config.targets ?? {})) targets.set(key, values);

  return {
    alwaysSafe,
    gated,
    pruneMeta,
    skipDirs,
    targets,
  };
}

/**
 * Restricts matching to a set of tokens (from `--targets`), each either a
 * literal artifact name or a named group defined in the ruleset's `targets`
 * map (which expands to its member names). An empty token list is a no-op
 * (matches everything, same as not passing --targets at all).
 */
export function restrictRuleSetToTargets(ruleSet: ResolvedRuleSet, tokens: readonly string[]): ResolvedRuleSet {
  if (tokens.length === 0) return ruleSet;

  const names = new Set<string>();
  for (const token of tokens) {
    const group = ruleSet.targets.get(token);
    if (group) {
      for (const name of group) names.add(name);
    } else {
      names.add(token);
    }
  }

  return {
    alwaysSafe: new Set([...ruleSet.alwaysSafe].filter((name) => names.has(name))),
    gated: new Map([...ruleSet.gated].filter(([name]) => names.has(name))),
    pruneMeta: ruleSet.pruneMeta,
    skipDirs: ruleSet.skipDirs,
    targets: ruleSet.targets,
  };
}
