import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'purgeit';
export const siteUrl = 'https://purgeit.nandan.fyi';
export const tagline = 'Reclaim disk space from every project — safely.';
export const siteDescription =
  'Find and safely delete regenerable build artifacts — node_modules, target, dist, Pods and more — across all your projects. Fast scanning, strict safety checks, an interactive UI, a scriptable CLI and a typed library.';

export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';

export const gitConfig = {
  user: 'nandan-varma',
  repo: 'purgeit',
  branch: 'main',
  /** Where the docs content lives in the repository. */
  contentDir: 'docs/content/docs',
};

export const repoUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
export const npmUrl = 'https://www.npmjs.com/package/purgeit';

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];
  return { segments, url: getImageUrl(segments, page.locale) };
}
