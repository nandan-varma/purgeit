/**
 * The documentation's table of contents — the single source for both the docs
 * site's sidebar (docs/astro.config.mjs imports it) and `purgeit docs`, so the
 * two can never list different pages. Each slug is a page in
 * docs/src/content/docs/, published at `${DOCS_SITE_URL}/<slug>/`.
 */
export const DOCS_SITE_URL = 'https://purgeit.nandan.fyi';

export interface DocSection {
  readonly label: string;
  readonly items: readonly { readonly label: string; readonly slug: string }[];
}

export const DOC_SECTIONS: readonly DocSection[] = [
  {
    label: 'Start here',
    items: [
      { label: 'Getting started', slug: 'getting-started' },
      { label: 'Interactive TUI', slug: 'tui' },
      { label: 'CLI reference', slug: 'cli' },
      { label: 'Configuration', slug: 'configuration' },
      { label: 'Built-in rules', slug: 'rules' },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { label: 'Architecture', slug: 'architecture' },
      { label: 'API reference', slug: 'api' },
      { label: 'Cloud cleanup (AWS & GCP)', slug: 'cloud' },
      { label: 'Scheduled cleanup', slug: 'scheduled-cleanup' },
    ],
  },
  {
    label: 'Community',
    items: [
      { label: 'FAQ & troubleshooting', slug: 'faq' },
      { label: 'Contributing', slug: 'contributing' },
    ],
  },
];

/** Public URL of a docs page (with an optional #fragment). */
export function docUrl(slug: string, fragment = ''): string {
  return `${DOCS_SITE_URL}/${slug}/${fragment}`;
}
