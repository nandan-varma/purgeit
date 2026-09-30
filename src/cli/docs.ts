import { readFile } from 'node:fs/promises';
import { renderTopic, splitFrontmatter } from '../docs/render.js';
import { DOC_SECTIONS, DOCS_SITE_URL, docUrl } from '../docs/topics.js';
import { formatErrorMessage } from '../format.js';
import { resolvePackageDir } from './package-path.js';

export interface DocsIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

interface Topic {
  readonly section: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly url: string;
}

const SLUGS = DOC_SECTIONS.flatMap((section) => section.items.map((item) => item.slug));

/** Reads a page's source, whichever of .md / .mdx it is written in. */
async function readPage(dir: URL, slug: string): Promise<string> {
  return readFile(new URL(`${slug}.md`, dir), 'utf8').catch(() =>
    readFile(new URL(`${slug}.mdx`, dir), 'utf8'),
  );
}

async function listTopics(dir: URL): Promise<Topic[]> {
  return Promise.all(
    DOC_SECTIONS.flatMap((section) =>
      section.items.map(async (item): Promise<Topic> => {
        const { description } = splitFrontmatter(await readPage(dir, item.slug));
        return {
          section: section.label,
          slug: item.slug,
          title: item.label,
          description: description ?? '',
          url: docUrl(item.slug),
        };
      }),
    ),
  );
}

/**
 * Implements `purgeit docs [topic] [--json]`: the documentation site's own
 * pages, served from the installed package so they always match this version.
 */
export async function runDocsCommand(argv: string[], io: DocsIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const json = argv.includes('--json');
  const [topic, ...extra] = argv.filter((arg) => arg !== '--json');

  if (extra.length > 0) {
    stderr(`purgeit: unexpected docs argument '${extra[0]}'`);
    return 2;
  }
  if (topic !== undefined && !SLUGS.includes(topic)) {
    stderr(`purgeit: unknown docs topic '${topic}' (expected one of: ${SLUGS.join(', ')})`);
    return 2;
  }

  try {
    const dir = await resolvePackageDir('docs/src/content/docs');
    if (topic !== undefined) {
      const text = renderTopic(topic, await readPage(dir, topic));
      stdout(
        json ? JSON.stringify({ slug: topic, url: docUrl(topic), markdown: text }, null, 2) : text,
      );
      return 0;
    }
    const topics = await listTopics(dir);
    if (json) {
      stdout(JSON.stringify(topics, null, 2));
      return 0;
    }
    stdout(`purgeit documentation — ${DOCS_SITE_URL}\n`);
    stdout('Read a page with `purgeit docs <topic>`; add --json for machine-readable output.');
    for (const section of DOC_SECTIONS) {
      stdout(`\n${section.label}`);
      for (const t of topics.filter((t) => t.section === section.label)) {
        stdout(`  ${t.slug.padEnd(18)} ${t.description}`);
      }
    }
    return 0;
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
}
