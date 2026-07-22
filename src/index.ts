export { loadConfig } from './config/resolve.js';
export type { GateCondition, PurgeitUserConfig, UserGatedRule } from './config/schema.js';
export type { DeleteEvent, DeleteOptions } from './delete/deleter.js';
export { deleteEntries } from './delete/deleter.js';
export { defaultRuleSet, mergeRuleSets } from './rules/merge.js';
export { createExcludeMatcher } from './scan/exclude.js';
export { type ScanEntry, type ScanEvent, type ScanOptions, scan } from './scan/scanner.js';
export type {
  ArtifactRule,
  Gate,
  GateContext,
  ResolvedRuleSet,
  ValidationWarning,
} from './types.js';
