import { type Config, ConfigSchema } from '../config/schema.js';
import { PurgeitError } from '../errors.js';
import { RULE_CATALOG } from './catalog/index.js';
import type {
  GatedRuleDefinition,
  MarkerRuleDefinition,
  RuleDefinition,
  SafeRuleDefinition,
} from './catalog/types.js';

export type NamedRule = SafeRuleDefinition | GatedRuleDefinition;
export type MarkerRule = MarkerRuleDefinition;
export type MatchRule = NamedRule | MarkerRule;

/** The compiled, ready-to-scan form of the built-in catalog plus a user's config. */
export interface RuleSet {
  /** Rules that match by directory name, keyed by that name. */
  readonly named: ReadonlyMap<string, NamedRule>;
  /** Rules that match any directory carrying a tag file. */
  readonly markers: readonly MarkerRule[];
  /** Directory names that are never entered. */
  readonly ignore: ReadonlySet<string>;
  readonly groups: ReadonlyMap<string, readonly string[]>;
}

/** Builds the rule set for `config` (the built-in defaults when omitted). */
export function createRuleSet(config: Config = ConfigSchema.parse({})): RuleSet {
  const known = new Set(RULE_CATALOG.filter((rule) => rule.kind !== 'ignore').map((r) => r.name));
  const unknown = config.disable.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new PurgeitError(`Cannot disable unknown built-in rule(s): ${unknown.join(', ')}.`);
  }
  const disabled = new Set(config.disable);
  const builtin = config.defaults
    ? RULE_CATALOG.filter((rule) => rule.kind !== 'ignore' && !disabled.has(rule.name))
    : [];

  const custom: RuleDefinition[] = [
    ...config.safe.map(
      (name): RuleDefinition => ({
        kind: 'safe',
        name,
        categories: ['custom'],
        description: 'Defined in your config',
      }),
    ),
    ...config.gated.map(
      (rule): RuleDefinition => ({
        kind: 'gated',
        name: rule.name,
        categories: ['custom'],
        description: rule.description ?? 'Defined in your config',
        when: rule.when,
      }),
    ),
    ...config.markers.map(
      (rule): RuleDefinition => ({
        kind: 'marker',
        categories: ['custom'],
        ...rule,
        description: rule.description ?? 'Defined in your config',
      }),
    ),
  ];

  const named = new Map<string, NamedRule>();
  const markers = new Map<string, MarkerRule>();
  // Built-ins first, so a rule of the same name in the user's config replaces them.
  for (const rule of [...builtin, ...custom]) {
    if (rule.kind === 'marker') markers.set(rule.name, rule);
    else if (rule.kind !== 'ignore') named.set(rule.name, rule);
  }
  // VCS metadata is never entered, whatever the config says.
  const ignore = new Set([
    ...RULE_CATALOG.filter((rule) => rule.kind === 'ignore').map((rule) => rule.name),
    ...config.ignore,
  ]);

  return {
    named,
    markers: [...markers.values()],
    ignore,
    groups: new Map(Object.entries(config.groups)),
  };
}

/** Keeps only the rules named by `tokens`, each a rule name or a group (`--only`). */
export function restrictRuleSet(rules: RuleSet, tokens: readonly string[]): RuleSet {
  const wanted = new Set<string>();
  const unknown: string[] = [];
  for (const token of tokens) {
    const group = rules.groups.get(token);
    if (group !== undefined) for (const name of group) wanted.add(name);
    else wanted.add(token);
  }
  for (const name of wanted) {
    if (!rules.named.has(name) && !rules.markers.some((rule) => rule.name === name)) {
      unknown.push(name);
    }
  }
  if (unknown.length > 0) {
    throw new PurgeitError(
      `Unknown rule or group: ${unknown.join(', ')}. Run \`purgeit rules\` to list the rules.`,
    );
  }
  return {
    ...rules,
    named: new Map([...rules.named].filter(([name]) => wanted.has(name))),
    markers: rules.markers.filter((rule) => wanted.has(rule.name)),
  };
}

/** Drops every gated rule, leaving only names that are safe wherever they appear. */
export function onlySafeRules(rules: RuleSet): RuleSet {
  return { ...rules, named: new Map([...rules.named].filter(([, rule]) => rule.kind === 'safe')) };
}
