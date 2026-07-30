import { createGateContext } from '../rules/gate-context.js';
import type { Gate } from '../types.js';

/** JSON-safe gate condition, compiled into a `Gate` at merge time. */
export type GateCondition =
  | { readonly file: string }
  | { readonly glob: string }
  | { readonly grep: { readonly file: string; readonly pattern: string } };

export interface DeclarativeGatedRule {
  readonly name: string;
  readonly when: GateCondition | readonly GateCondition[];
}

export interface FunctionGatedRule {
  readonly name: string;
  readonly gate: Gate;
}

export type UserGatedRule = DeclarativeGatedRule | FunctionGatedRule;

export function isDeclarativeGatedRule(rule: UserGatedRule): rule is DeclarativeGatedRule {
  return 'when' in rule;
}

/** User-supplied rules layered on top of (or replacing) the built-in default ruleset. */
export interface PurgeitUserConfig {
  /** 'merge' (default) layers on top of the built-in defaults; 'replace' starts empty. */
  readonly extends?: 'merge' | 'replace';
  readonly alwaysSafe?: readonly string[];
  readonly alwaysSafeRemove?: readonly string[];
  readonly gated?: readonly UserGatedRule[];
  readonly gatedRemove?: readonly string[];
  readonly skipDirs?: readonly string[];
  readonly pruneNames?: readonly string[];
  readonly targets?: Readonly<Record<string, readonly string[]>>;
  /** Cloud resource discovery settings — used only when scanning with `--provider aws|gcp`. */
  readonly cloud?: PurgeitCloudConfig;
}

export interface PurgeitCloudConfig {
  readonly aws?: { readonly profile?: string; readonly region?: string };
  readonly gcp?: { readonly project?: string };
  /** Tag/label key required on a resource for it to be discovered. Default: 'purgeit-managed' — valid as both an AWS tag key and a GCP label key. */
  readonly tagKey?: string;
  /** Tag/label value required alongside tagKey. Default: 'true'. */
  readonly tagValue?: string;
  /** Default --max-age (in days) for scheduled/cron cloud cleanup recipes. */
  readonly maxAgeDays?: number;
}

function compileGateCondition(condition: GateCondition): Gate {
  if ('file' in condition) {
    const { file } = condition;
    return (ctx) => ctx.siblingFile(file);
  }
  if ('glob' in condition) {
    const { glob } = condition;
    return (ctx) => ctx.siblingGlob(glob);
  }
  const { file, pattern } = condition.grep;
  const re = new RegExp(pattern, 'm');
  return (ctx) => ctx.siblingGrep(file, re);
}

/** Compiles one or more OR'd GateConditions into a single Gate predicate. */
export function compileGateConditions(conditions: GateCondition | readonly GateCondition[]): Gate {
  const list = Array.isArray(conditions) ? conditions : [conditions];
  const gates = list.map(compileGateCondition);
  return (ctx) => gates.some((gate) => gate(ctx));
}

/** Convenience: evaluate a compiled Gate directly against a real path. */
export function evaluateGate(gate: Gate, path: string): boolean {
  return gate(createGateContext(path));
}

/**
 * Validates a raw value loaded from a config file against the
 * PurgeitUserConfig shape, throwing a descriptive TypeError (naming the
 * source file) on the first problem found. JSON/JS/TS config files aren't
 * statically checked, so this is the only thing standing between a typo in
 * a user's config and a confusing failure deep inside the rule engine.
 */
export function assertPurgeitUserConfig(
  raw: unknown,
  source = '<config>',
): asserts raw is PurgeitUserConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TypeError(`purgeit: invalid config at ${source} — expected an object`);
  }
  const cfg = raw as Record<string, unknown>;

  if (cfg.extends !== undefined && cfg.extends !== 'merge' && cfg.extends !== 'replace') {
    throw new TypeError(
      `purgeit: invalid config at ${source} — "extends" must be 'merge' or 'replace'`,
    );
  }
  assertOptionalStringArray(cfg.alwaysSafe, 'alwaysSafe', source);
  assertOptionalStringArray(cfg.alwaysSafeRemove, 'alwaysSafeRemove', source);
  assertOptionalStringArray(cfg.gatedRemove, 'gatedRemove', source);
  assertOptionalStringArray(cfg.skipDirs, 'skipDirs', source);
  assertOptionalStringArray(cfg.pruneNames, 'pruneNames', source);

  if (cfg.gated !== undefined) {
    if (!Array.isArray(cfg.gated)) {
      throw new TypeError(`purgeit: invalid config at ${source} — "gated" must be an array`);
    }
    for (const rule of cfg.gated) {
      assertUserGatedRule(rule, source);
    }
  }

  if (cfg.targets !== undefined) {
    if (typeof cfg.targets !== 'object' || cfg.targets === null || Array.isArray(cfg.targets)) {
      throw new TypeError(`purgeit: invalid config at ${source} — "targets" must be an object`);
    }
    for (const [key, value] of Object.entries(cfg.targets as Record<string, unknown>)) {
      assertOptionalStringArray(value, `targets.${key}`, source, true);
    }
  }

  assertOptionalCloudConfig(cfg.cloud, source);
}

function assertOptionalStringField(value: unknown, field: string, source: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new TypeError(`purgeit: invalid config at ${source} — "${field}" must be a string`);
  }
}

function assertOptionalCloudConfig(value: unknown, source: string): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`purgeit: invalid config at ${source} — "cloud" must be an object`);
  }
  const cloud = value as Record<string, unknown>;

  if (cloud.aws !== undefined) {
    if (typeof cloud.aws !== 'object' || cloud.aws === null || Array.isArray(cloud.aws)) {
      throw new TypeError(`purgeit: invalid config at ${source} — "cloud.aws" must be an object`);
    }
    const aws = cloud.aws as Record<string, unknown>;
    assertOptionalStringField(aws.profile, 'cloud.aws.profile', source);
    assertOptionalStringField(aws.region, 'cloud.aws.region', source);
  }

  if (cloud.gcp !== undefined) {
    if (typeof cloud.gcp !== 'object' || cloud.gcp === null || Array.isArray(cloud.gcp)) {
      throw new TypeError(`purgeit: invalid config at ${source} — "cloud.gcp" must be an object`);
    }
    const gcp = cloud.gcp as Record<string, unknown>;
    assertOptionalStringField(gcp.project, 'cloud.gcp.project', source);
  }

  assertOptionalStringField(cloud.tagKey, 'cloud.tagKey', source);
  assertOptionalStringField(cloud.tagValue, 'cloud.tagValue', source);

  if (cloud.maxAgeDays !== undefined) {
    if (typeof cloud.maxAgeDays !== 'number' || !Number.isFinite(cloud.maxAgeDays)) {
      throw new TypeError(
        `purgeit: invalid config at ${source} — "cloud.maxAgeDays" must be a number`,
      );
    }
    if (cloud.maxAgeDays < 0) {
      throw new TypeError(
        `purgeit: invalid config at ${source} — "cloud.maxAgeDays" must be non-negative`,
      );
    }
  }
}

function assertOptionalStringArray(
  value: unknown,
  field: string,
  source: string,
  required = false,
): void {
  if (value === undefined) {
    if (required) {
      throw new TypeError(`purgeit: invalid config at ${source} — "${field}" is required`);
    }
    return;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new TypeError(
      `purgeit: invalid config at ${source} — "${field}" must be an array of strings`,
    );
  }
}

function assertUserGatedRule(rule: unknown, source: string): void {
  if (typeof rule !== 'object' || rule === null) {
    throw new TypeError(
      `purgeit: invalid config at ${source} — each "gated" entry must be an object`,
    );
  }
  const r = rule as Record<string, unknown>;
  if (typeof r.name !== 'string' || r.name.length === 0) {
    throw new TypeError(
      `purgeit: invalid config at ${source} — each "gated" entry needs a non-empty "name"`,
    );
  }
  const hasWhen = 'when' in r;
  const hasGate = 'gate' in r;
  if (hasWhen === hasGate) {
    throw new TypeError(
      `purgeit: invalid config at ${source} — gated rule "${r.name}" must have exactly one of "when" or "gate"`,
    );
  }
  if (hasGate && typeof r.gate !== 'function') {
    throw new TypeError(
      `purgeit: invalid config at ${source} — gated rule "${r.name}"'s "gate" must be a function`,
    );
  }
  if (hasWhen) {
    const list = Array.isArray(r.when) ? r.when : [r.when];
    for (const condition of list) {
      assertGateCondition(condition, r.name, source);
    }
  }
}

function assertGateCondition(condition: unknown, ruleName: string, source: string): void {
  if (typeof condition !== 'object' || condition === null) {
    throw new TypeError(
      `purgeit: invalid config at ${source} — gated rule "${ruleName}" has an invalid condition`,
    );
  }
  const c = condition as Record<string, unknown>;
  const keys = (['file', 'glob', 'grep'] as const).filter((key) => key in c);
  if (keys.length !== 1) {
    throw new TypeError(
      `purgeit: invalid config at ${source} — gated rule "${ruleName}" condition must have exactly one of file/glob/grep`,
    );
  }
  const key = keys[0];
  if ((key === 'file' || key === 'glob') && typeof c[key] !== 'string') {
    throw new TypeError(
      `purgeit: invalid config at ${source} — gated rule "${ruleName}"'s "${key}" must be a string`,
    );
  }
  if (key === 'grep') {
    const grep = c.grep;
    const valid =
      typeof grep === 'object' &&
      grep !== null &&
      typeof (grep as Record<string, unknown>).file === 'string' &&
      typeof (grep as Record<string, unknown>).pattern === 'string';
    if (!valid) {
      throw new TypeError(
        `purgeit: invalid config at ${source} — gated rule "${ruleName}"'s "grep" must be { file, pattern } strings`,
      );
    }
  }
}
