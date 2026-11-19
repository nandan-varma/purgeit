export {
  type CleanEvent,
  type CleanOptions,
  type CleanSummary,
  clean,
  type Target,
} from './clean/clean.js';
export type { Refusal, RefusalCode } from './clean/guard.js';
export {
  appendHistory,
  defaultHistoryFile,
  type HistoryRecord,
  readHistory,
} from './clean/history.js';
export { type LoadedConfig, loadConfig } from './config/load.js';
export { type Config, type ConfigInput, ConfigSchema, defineConfig } from './config/schema.js';
export { PurgeitError } from './errors.js';
export { type Measurement, measure } from './fs/measure.js';
export { findProtection, PROTECTION_LABELS, type ProtectionReason } from './fs/protection.js';
export { RULE_CATALOG } from './rules/catalog/index.js';
export type { RuleCategory, RuleDefinition } from './rules/catalog/types.js';
export { CATEGORY_LABELS, CATEGORY_ORDER } from './rules/catalog/types.js';
export type { Condition, When } from './rules/condition.js';
export {
  createRuleSet,
  type MarkerRule,
  type MatchRule,
  type NamedRule,
  onlySafeRules,
  type RuleSet,
  restrictRuleSet,
} from './rules/rule-set.js';
export { discoverRoots } from './scan/discover.js';
export {
  activityOf,
  compareGroups,
  DEFAULT_DORMANT_MS,
  groupProjects,
  isDormant,
  type ProjectGroup,
} from './scan/projects.js';
export type { ProjectRef } from './scan/project.js';
export {
  type DropReason,
  type Entry,
  normalizeRoots,
  type ScanEvent,
  type ScanOptions,
  type ScanResult,
  type ScanSummary,
  scan,
  scanAll,
} from './scan/scan.js';
