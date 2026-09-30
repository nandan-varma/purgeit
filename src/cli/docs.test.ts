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
});
