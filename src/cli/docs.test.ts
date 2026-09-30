import { describe, expect, it, vi } from 'vitest';
import { runDocsCommand } from './docs.js';

function captureIO() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) };
}

describe('purgeit docs', () => {
  it('lists every topic by section with its description', async () => {
    const io = captureIO();
    expect(await runDocsCommand([], io)).toBe(0);
    const text = io.out.join('\n');
    expect(text).toMatch(/^purgeit documentation — https:\/\/purgeit\.nandan\.fyi/);
    expect(text).toContain('Start here');
    expect(text).toMatch(/ {2}getting-started +Install purgeit/);
    expect(text).toMatch(/ {2}contributing +Development workflow/);
  });

  it('lists topics as JSON', async () => {
    const io = captureIO();
    expect(await runDocsCommand(['--json'], io)).toBe(0);
    const topics = JSON.parse(io.out.join(''));
    expect(topics[0]).toEqual(
      expect.objectContaining({
        section: 'Start here',
        slug: 'getting-started',
        url: 'https://purgeit.nandan.fyi/getting-started/',
      }),
    );
    expect(topics).toHaveLength(11);
  });

  it('prints a topic, including MDX pages', async () => {
    const io = captureIO();
    expect(await runDocsCommand(['rules'], io)).toBe(0);
    expect(io.out[0]).toMatch(/^# Built-in rules\n/);
  });

  it('prints a topic as JSON', async () => {
    const io = captureIO();
    expect(await runDocsCommand(['cli', '--json'], io)).toBe(0);
    const topic = JSON.parse(io.out.join(''));
    expect(topic.slug).toBe('cli');
    expect(topic.markdown).toMatch(/^# CLI reference/);
  });

  it('rejects unknown topics and extra arguments', async () => {
    for (const argv of [['nope'], ['cli', 'extra']]) {
      const io = captureIO();
      expect(await runDocsCommand(argv, io)).toBe(2);
      expect(io.err[0]).toMatch(/^purgeit: /);
    }
  });

  it('reports a missing docs directory', async () => {
    vi.resetModules();
    vi.doMock('./package-path.js', () => ({
      resolvePackageDir: async () => {
        throw new Error('could not locate docs');
      },
    }));
    const { runDocsCommand: run } = await import('./docs.js');
    const io = captureIO();
    expect(await run([], io)).toBe(2);
    expect(io.err).toEqual(['purgeit: could not locate docs']);
    vi.doUnmock('./package-path.js');
  });

  it('writes to the real stdout/stderr when no io is given', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runDocsCommand(['faq'])).toBe(0);
      expect(await runDocsCommand(['nope'])).toBe(2);
      expect(String(out.mock.calls[0]?.[0])).toMatch(/^# FAQ/);
      expect(String(err.mock.calls[0]?.[0])).toMatch(/unknown docs topic 'nope'/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('lists a page without a description with an empty one', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const dir = mkdtempSync(join(tmpdir(), 'purgeit-docs-'));
    const { DOC_SECTIONS } = await import('../docs/topics.js');
    for (const section of DOC_SECTIONS) {
      for (const item of section.items)
        writeFileSync(join(dir, `${item.slug}.md`), '# no frontmatter');
    }
    vi.resetModules();
    vi.doMock('./package-path.js', () => ({
      resolvePackageDir: async () => pathToFileURL(`${dir}/`),
    }));
    try {
      const { runDocsCommand: run } = await import('./docs.js');
      const io = captureIO();
      expect(await run(['--json'], io)).toBe(0);
      expect(JSON.parse(io.out.join(''))[0].description).toBe('');
    } finally {
      vi.doUnmock('./package-path.js');
    }
  });
});
