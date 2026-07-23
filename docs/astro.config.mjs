import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://purgeit.nandan.fyi',
  integrations: [
    starlight({
      title: 'purgeit',
      tagline: 'Find and delete regenerable dev build artifacts across your projects.',
      description: 'Interactive TUI and headless CLI for safely reclaiming disk space from node_modules, dist, target, Pods, and other rebuildable project artifacts.',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logo.svg',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/nandan-varma/purgeit' },
        { icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/purgeit' },
      ],
      sidebar: [
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
          ],
        },
        {
          label: 'Community',
          items: [
            { label: 'FAQ & troubleshooting', slug: 'faq' },
            { label: 'Contributing', slug: 'contributing' },
          ],
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/nandan-varma/purgeit/edit/main/docs/',
      },
      head: [
        // Starlight already generates per-page <title>, canonical, og:*, and
        // twitter:* tags from each page's own frontmatter (see
        // @astrojs/starlight/utils/head.ts) — don't add fixed og:title/
        // og:description/twitter:* entries here, they'd clobber every
        // non-home page's tags with the homepage's values (config.head wins
        // over the per-page defaults in Starlight's head-merge).
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'purgeit',
            description:
              'Interactive TUI and headless CLI for safely reclaiming disk space from node_modules, dist, target, Pods, and other rebuildable project artifacts.',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'macOS, Linux, Windows',
            url: 'https://purgeit.nandan.fyi',
            downloadUrl: 'https://www.npmjs.com/package/purgeit',
            codeRepository: 'https://github.com/nandan-varma/purgeit',
            license: 'https://opensource.org/licenses/MIT',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
          }),
        },
      ],
      lastUpdated: true,
    }),
  ],
});
