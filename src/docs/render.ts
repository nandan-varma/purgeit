import { describeWhen, KIND_LABELS, KIND_ORDER } from '../rules/catalog/describe.js';
import { CATEGORY_LABELS, CATEGORY_ORDER, RULE_CATALOG } from '../rules/catalog/index.js';
import type { RuleDefinition } from '../rules/catalog/types.js';
import { DOC_SECTIONS, docUrl } from './topics.js';

/** Title and description from a page's YAML frontmatter, plus the body after it. */
export function splitFrontmatter(source: string): {
  title: string | undefined;
  description: string | undefined;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) return { title: undefined, description: undefined, body: source };
  const field = (name: string) =>
    new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(match[1] as string)?.[1]?.trim();
  return {
    title: field('title'),
    description: field('description'),
    body: source.slice(match[0].length),
  };
}

/** The built-in rule catalog as Markdown tables, one per ecosystem — the terminal form of the site's rule accordion. */
export function renderRuleCatalog(): string {
  const sections: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const rules = RULE_CATALOG.filter((rule) => rule.categories.includes(category)).sort(
      (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
    );
    const rows = rules.map(
      (rule) => `| \`${rule.name}\` | ${KIND_LABELS[rule.kind]} | ${ruleDetail(rule)} |`,
    );
    sections.push(
      `### ${CATEGORY_LABELS[category]}\n\n| Rule | Kind | Description |\n|---|---|---|\n${rows.join('\n')}`,
    );
  }
  return sections.join('\n\n');
}

function ruleDetail(rule: RuleDefinition): string {
  if (rule.kind === 'gated')
    return `${rule.description} — requires a sibling ${describeWhen(rule.when)}`;
  if (rule.kind === 'marker') {
    return `${rule.description} — any directory containing \`${rule.file}\` starting with \`${rule.signature}\``;
  }
  return rule.description;
}

const KNOWN_SLUGS: ReadonlySet<string> = new Set(
  DOC_SECTIONS.flatMap((section) => section.items.map((item) => item.slug)),
);

/**
 * Turns a docs page (Markdown or MDX) into terminal-friendly Markdown: MDX
 * imports go, the rule accordion becomes Markdown tables, and site-relative links become absolute
 * URLs, with a closing "See also" of the `purgeit docs` topics the page links to.
 */
export function renderTopic(slug: string, source: string): string {
  const { title, description, body } = splitFrontmatter(source);
  const linked = new Set<string>();
  const text = body
    .replace(/^import .+;\n/gm, '')
    .replace(/^\s*<RuleAccordion\s*\/>\s*$/m, renderRuleCatalog())
    .replace(
      /\]\(\/([a-z-]+)\/(#[\w-]+)?\)/g,
      (whole, target: string, fragment: string | undefined) => {
        if (!KNOWN_SLUGS.has(target)) return whole;
        if (target !== slug) linked.add(target);
        return `](${docUrl(target, fragment)})`;
      },
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const header = [
    `# ${title ?? slug}`,
    ...(description ? ['', description] : []),
    '',
    `Web: ${docUrl(slug)}`,
  ];
  const seeAlso = [...linked].map((target) => `- \`purgeit docs ${target}\` — ${docUrl(target)}`);
  return [
    ...header,
    '',
    text,
    ...(seeAlso.length > 0 ? ['', '## See also', '', ...seeAlso] : []),
  ].join('\n');
}
