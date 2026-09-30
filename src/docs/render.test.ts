import { describe, expect, it } from 'vitest';
import { renderRuleCatalog, renderTopic, splitFrontmatter } from './render.js';

describe('splitFrontmatter', () => {
  it('reads title and description and returns the body after the frontmatter', () => {
    expect(splitFrontmatter('---\ntitle: T\ndescription: D\n---\nbody')).toEqual({
      title: 'T',
      description: 'D',
      body: 'body',
    });
  });

  it('returns the whole source as body when there is no frontmatter', () => {
    expect(splitFrontmatter('# plain')).toEqual({
      title: undefined,
      description: undefined,
      body: '# plain',
    });
  });
});

describe('renderTopic', () => {
  const page = [
    '---',
    'title: CLI reference',
    'description: Command-line options.',
    '---',
    "import X from '../x.astro';",
    '',
    'See [rules](/rules/), [the TUI](/tui/#keys), [this page](/cli/) and [elsewhere](/not-a-topic/).',
  ].join('\n');

  it('adds a header with the web URL, rewrites site links, and lists linked topics', () => {
    expect(renderTopic('cli', page)).toBe(
      [
        '# CLI reference',
        '',
        'Command-line options.',
        '',
        'Web: https://purgeit.nandan.fyi/cli/',
        '',
        'See [rules](https://purgeit.nandan.fyi/rules/), [the TUI](https://purgeit.nandan.fyi/tui/#keys), [this page](https://purgeit.nandan.fyi/cli/) and [elsewhere](/not-a-topic/).',
        '',
        '## See also',
        '',
        '- `purgeit docs rules` — https://purgeit.nandan.fyi/rules/',
        '- `purgeit docs tui` — https://purgeit.nandan.fyi/tui/',
      ].join('\n'),
    );
  });

  it('falls back to the slug as title and omits empty sections', () => {
    expect(renderTopic('faq', 'Just text.')).toBe(
      '# faq\n\nWeb: https://purgeit.nandan.fyi/faq/\n\nJust text.',
    );
  });

  it('replaces the rule accordion with the rendered catalog', () => {
    const rendered = renderTopic('rules', 'Intro\n\n<RuleAccordion />\n\nOutro');
    expect(rendered).toContain('### JavaScript / TypeScript');
    expect(rendered).not.toContain('<RuleAccordion');
  });
});

describe('renderRuleCatalog', () => {
  it('describes gated conditions and marker signatures', () => {
    const catalog = renderRuleCatalog();
    expect(catalog).toMatch(/\| `Pods` \| gated \| .* — requires a sibling Podfile \|/);
    expect(catalog).toContain('| `CACHEDIR.TAG` | tagged |');
    expect(catalog).toContain('| `.git` | pruned | Git metadata |');
  });
});
