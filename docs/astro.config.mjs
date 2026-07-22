import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'purgeit',
      tagline: 'Find and delete regenerable dev build artifacts across your projects.',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logo.svg',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/nandan-varma/purgeit' },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Getting started', slug: 'getting-started' },
            { label: 'CLI reference', slug: 'cli' },
            { label: 'Configuration', slug: 'configuration' },
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
            { label: 'Contributing', slug: 'contributing' },
          ],
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/nandan-varma/purgeit/edit/main/docs/',
      },
    }),
  ],
});
