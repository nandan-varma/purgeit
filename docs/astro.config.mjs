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
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.googleapis.com',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.gstatic.com',
            crossorigin: '',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
          },
        },
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#1a73e8' },
        },
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
      customCss: ['./src/styles/custom.css'],
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
      ],
      editLink: {
        baseUrl: 'https://github.com/nandan-varma/purgeit/edit/main/docs/',
      },
      lastUpdated: true,
    }),
  ],
});
