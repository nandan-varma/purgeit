import { styleText } from 'node:util';

import { PurgeitError } from '../../errors.js';
import { describeWhen } from '../../rules/catalog/describe.js';
import { CATEGORY_LABELS, CATEGORY_ORDER, type RuleCategory } from '../../rules/catalog/types.js';
import type { MatchRule } from '../../rules/rule-set.js';
import type { CliEnv } from '../env.js';
import type { ScanFlags } from '../flags.js';
import { resolveRules } from '../options.js';

export interface RulesFlags extends Pick<ScanFlags, 'config' | 'only' | 'safeOnly'> {
  category?: string;
  format: 'text' | 'json';
}

const inCategory = (rule: MatchRule, category: RuleCategory): boolean =>
  rule.categories.includes(category);

const detail = (rule: MatchRule): string =>
  rule.kind === 'gated'
    ? `only beside ${describeWhen(rule.when)}`
    : rule.kind === 'marker'
      ? `any directory containing ${rule.file}`
      : rule.description;

/** Lists the rules in effect: the built-ins plus whatever the config adds or removes. */
export async function runRules(flags: RulesFlags, env: CliEnv): Promise<number> {
  const { rules } = await resolveRules(flags, env);
  if (
    flags.category !== undefined &&
    !(CATEGORY_ORDER as readonly string[]).includes(flags.category)
  ) {
    throw new PurgeitError(
      `Unknown category "${flags.category}". Categories: ${CATEGORY_ORDER.join(', ')}.`,
    );
  }
  const all: MatchRule[] = [...rules.named.values(), ...rules.markers];

  if (flags.format === 'json') {
    const selected = all.filter(
      (rule) =>
        flags.category === undefined ||
        (rule.categories as readonly string[]).includes(flags.category),
    );
    env.out(JSON.stringify(selected, null, 2));
    return 0;
  }

  const sections = CATEGORY_ORDER.filter(
    (c) => flags.category === undefined || c === flags.category,
  )
    .map((category) => ({ category, rules: all.filter((rule) => inCategory(rule, category)) }))
    .filter((section) => section.rules.length > 0);
  const width = Math.max(0, ...all.map((rule) => rule.name.length));
  for (const { category, rules: list } of sections) {
    env.out(styleText('bold', CATEGORY_LABELS[category]));
    for (const rule of [...list].toSorted((a, b) => a.name.localeCompare(b.name))) {
      env.out(
        `  ${rule.name.padEnd(width)}  ${styleText('dim', rule.kind.padEnd(6))}  ${detail(rule)}`,
      );
    }
    env.out('');
  }
  env.out(`${all.length} rules in effect.`);
  return 0;
}
