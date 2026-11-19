import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import GithubSlugger from 'github-slugger';
import { type FileObject, printErrors, scanURLs, validateFiles } from 'next-validate-link';

const contentDir = join(import.meta.dirname, '..', 'content', 'docs');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.mdx?$/.test(entry.name)) yield path;
  }
}

/** `guides/getting-started.mdx` → ['guides', 'getting-started']; `index.mdx` → []. */
const slugsOf = (file: string): string[] =>
  relative(contentDir, file)
    .replace(/\.mdx?$/, '')
    .split(sep)
    .filter((part, index, parts) => !(part === 'index' && index === parts.length - 1));

/** Heading anchors, slugged the way Fumadocs does. Code fences are skipped. */
function headingsOf(content: string): string[] {
  const slugger = new GithubSlugger();
  let fenced = false;
  const anchors: string[] = [];
  for (const line of content.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6}\s+(.+?)\s*#*$/.exec(line)?.[1];
    if (heading) anchors.push(slugger.slug(heading.replace(/[`*_]/g, '')));
  }
  return anchors;
}

const pages = [...walk(contentDir)].map((path) => {
  const content = readFileSync(path, 'utf8');
  const slugs = slugsOf(path);
  return { path, content, slugs, url: `/docs${slugs.length ? `/${slugs.join('/')}` : ''}` };
});

const scanned = await scanURLs({
  preset: 'next',
  populate: {
    'docs/[[...slug]]': pages.map((page) => ({
      value: { slug: page.slugs },
      hashes: headingsOf(page.content),
    })),
  },
});

// Route handlers, not pages: served, but not discoverable from the page tree.
for (const url of ['/llms.txt', '/llms-full.txt']) scanned.urls.set(url, {});

const files: FileObject[] = pages.map(({ path, content, url }) => ({ path, content, url }));

printErrors(
  await validateFiles(files, {
    scanned,
    markdown: { components: { Card: { attributes: ['href'] } } },
    checkRelativePaths: 'as-url',
  }),
  true,
);
