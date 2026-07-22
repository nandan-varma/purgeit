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
        {
          tag: 'meta',
          attrs: { property: 'og:title', content: 'purgeit' },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:description',
            content: 'Interactive TUI and headless CLI for safely reclaiming disk space from node_modules, dist, target, Pods, and other rebuildable project artifacts.',
          },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:url', content: 'https://purgeit.nandan.fyi' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:title', content: 'purgeit' },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:description',
            content: 'Interactive TUI and headless CLI for safely reclaiming disk space from node_modules, dist, target, Pods, and other rebuildable project artifacts.',
          },
        },
      ],
      lastUpdated: true,
    }),
  ],
});
