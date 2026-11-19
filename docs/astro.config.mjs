import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://purgeit.nandan.fyi',
  redirects: {
    '/tui': '/guides/interactive-ui/',
    '/cli': '/reference/cli/',
    '/configuration': '/reference/configuration/',
    '/rules': '/reference/rules/',
    '/architecture': '/concepts/safety-model/',
    '/api': '/reference/library-api/',
    '/scheduled-cleanup': '/guides/automation/',
  },
  integrations: [
    starlight({
      title: 'purgeit',
      description: 'Find and safely delete regenerable build artifacts — node_modules, target, dist, Pods and more — across all your projects.',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logo.svg',
      },
      head: [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#0e9aa7' },
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'purgeit',
            description:
              'Fast, safe cleanup of build artifacts: interactive UI and scriptable CLI for reclaiming disk space from node_modules, dist, target, Pods, and other rebuildable project artifacts.',
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
      plugins: [
        starlightLinksValidator({ exclude: ['/llms.txt', '/llms-full.txt', '/llms-small.txt'] }),
        starlightLlmsTxt({
          projectName: 'purgeit',
          description:
            'purgeit finds and safely deletes regenerable build artifacts (node_modules, target, dist, Pods and more) across projects. It has an interactive terminal UI, a scriptable CLI with JSON output, and a typed library.',
          details:
            'Run `purgeit skill` for a guide versioned with the installed CLI. Deletions are re-verified at the moment of deletion; use `scan --format json` to review and `clean --plan` to apply.',
        }),
      ],
      sidebar: [
        { label: 'Start here', items: ['getting-started'] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'Project', items: ['faq', 'contributing'] },
      ],
      editLink: {
        baseUrl: 'https://github.com/nandan-varma/purgeit/edit/main/docs/',
      },
      lastUpdated: true,
    }),
  ],
});
