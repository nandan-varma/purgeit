import { RULE_CATALOG } from './catalog/index.js';

/**
 * Directory names that are unconditionally safe to delete wherever found in
 * a project tree. Derived from RULE_CATALOG (see `catalog/index.ts`), which
 * is the single source of truth for name, ecosystem, and description —
 * originally ported 1:1 from CLEANUP.sh's ALWAYS_SAFE_NAMES. Once matched
 * during a scan, the walker never descends further into these (no point
 * looking for node_modules inside node_modules).
 */
export const ALWAYS_SAFE_NAMES: readonly string[] = RULE_CATALOG.filter(
  (rule) => rule.kind === 'always-safe',
).map((rule) => rule.name);

/**
 * Directory names too generic to trust blindly wherever found — only
 * deletable when a sibling manifest in the same parent directory proves the
 * dir is really generated output. See gate-conditions.ts for the compiled
 * predicates and catalog/*.ts for each rule's declarative `when` condition.
 * Originally ported 1:1 from CLEANUP.sh's GATED_NAMES.
 */
export const GATED_NAMES: readonly string[] = RULE_CATALOG.filter(
  (rule) => rule.kind === 'gated',
).map((rule) => rule.name);

/** VCS metadata directories never descended into while scanning. */
export const PRUNE_META_NAMES: readonly string[] = RULE_CATALOG.filter(
  (rule) => rule.kind === 'prune-meta',
).map((rule) => rule.name);
