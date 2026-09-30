import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { appendHistory } from '../delete/history.js';
import { runHistoryCommand } from './history.js';

function captureIO() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) };
}

describe('purgeit history', () => {
  let root: string;
  let saved: string | undefined;
  beforeEach(() => {
    root = buildTree({});
    saved = process.env.PURGEIT_HISTORY_FILE;
    process.env.PURGEIT_HISTORY_FILE = join(root, 'history.jsonl');
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PURGEIT_HISTORY_FILE;
    else process.env.PURGEIT_HISTORY_FILE = saved;
    cleanupTree(root);
  });

  const seed = () =>
    appendHistory(
      [
        { schemaVersion: 1, time: 't1', action: 'deleted', path: '/a' },
        { schemaVersion: 1, time: 't2', action: 'failed', path: '/b', message: 'boom' },
        { schemaVersion: 1, time: 't3', action: 'failed', path: '/c' },
      ],
      join(root, 'history.jsonl'),
    );

  it('says so when nothing was recorded', async () => {
    const io = captureIO();
    expect(await runHistoryCommand([], io)).toBe(0);
    expect(io.out).toEqual(['No deletions recorded yet.']);
  });

  it('prints records newest first, with failure reasons', async () => {
    await seed();
    const io = captureIO();
    expect(await runHistoryCommand([], io)).toBe(0);
    expect(io.out).toEqual([
      't3  failed (unknown error)  /c',
      't2  failed (boom)  /b',
      't1  deleted  /a',
    ]);
  });

  it('prints JSON and honors --limit', async () => {
    await seed();
    const io = captureIO();
    expect(await runHistoryCommand(['--json', '--limit', '1'], io)).toBe(0);
    expect(JSON.parse(io.out.join(''))).toEqual([
      { schemaVersion: 1, time: 't3', action: 'failed', path: '/c' },
    ]);
  });

  it('prints usage for --help and rejects bad arguments', async () => {
    const help = captureIO();
    expect(await runHistoryCommand(['--help'], help)).toBe(0);
    expect(help.out[0]).toMatch(/^Usage: purgeit history/);
    for (const argv of [['--limit', '0'], ['--limit'], ['--bogus']]) {
      const io = captureIO();
      expect(await runHistoryCommand(argv, io)).toBe(2);
      expect(io.err[0]).toMatch(/^purgeit: /);
    }
  });

  it('writes to the real stdout/stderr when no io is given', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runHistoryCommand([])).toBe(0);
      expect(await runHistoryCommand(['--bogus'])).toBe(2);
      expect(out).toHaveBeenCalledWith('No deletions recorded yet.\n');
      expect(err).toHaveBeenCalledWith("purgeit: unexpected history argument '--bogus'\n");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
