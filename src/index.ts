export type { LoadConfigOptions, LoadedConfig } from './config/resolve.js';
export { loadConfig } from './config/resolve.js';
export type {
  GateCondition,
  PurgeitCloudConfig,
  PurgeitUserConfig,
  UserGatedRule,
} from './config/schema.js';
export type { DeleteEvent, DeleteOptions } from './delete/deleter.js';
export { DEFAULT_IDLE_MS, deleteEntries } from './delete/deleter.js';
export type { HistoryRecord } from './delete/history.js';
export { historyFile, readHistory } from './delete/history.js';
export type {
  CloudDeleteEvent,
  CloudDeleteOptions,
  CloudDiscoveryOptions,
  CloudProvider,
  CloudProviderId,
  CloudResource,
  CloudScanEvent,
  CostEstimate,
} from './providers/types.js';
export {
  type AlwaysSafeRuleDefinition,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type GatedRuleDefinition,
  type MarkerRuleDefinition,
  type PruneMetaRuleDefinition,
  RULE_CATALOG,
  type RuleCategory,
  type RuleDefinition,
} from './rules/catalog/index.js';
export {
  applyCliFilters,
  defaultRuleSet,
  mergeRuleSets,
  restrictRuleSetToTargets,
} from './rules/merge.js';
export { type Activity, checkActivity } from './scan/activity.js';
export { discoverRoots } from './scan/discover.js';
export { createExcludeMatcher } from './scan/exclude.js';
export {
  findProtection,
  PROTECTION_DESCRIPTIONS,
  type ProtectionReason,
} from './scan/protection.js';
export { type ScanEntry, type ScanEvent, type ScanOptions, scan } from './scan/scanner.js';
export type {
  ArtifactRule,
  Gate,
  GateContext,
  MarkerSpec,
  ResolvedRuleSet,
  ValidationWarning,
} from './types.js';
