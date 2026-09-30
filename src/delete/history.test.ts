import { mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { appendHistory, historyEnabled, historyFile, readHistory } from './history.js';

describe('historyFile', () => {
  it('honors PURGEIT_HISTORY_FILE, then the platform log/state directory', () => {
    const home = homedir();
    expect(historyFile({ PURGEIT_HISTORY_FILE: '/x/h.jsonl' }, 'darwin')).toBe('/x/h.jsonl');
    expect(historyFile({}, 'darwin')).toBe(
      join(home, 'Library', 'Logs', 'purgeit', 'history.jsonl'),
    );
    expect(historyFile({ LOCALAPPDATA: '/lad' }, 'win32')).toBe(
      join('/lad', 'purgeit', 'history.jsonl'),
    );
    expect(historyFile({}, 'win32')).toBe(
      join(home, 'AppData', 'Local', 'purgeit', 'history.jsonl'),
    );
    expect(historyFile({ XDG_STATE_HOME: '/state' }, 'linux')).toBe(
      join('/state', 'purgeit', 'history.jsonl'),
    );
    expect(historyFile({}, 'linux')).toBe(
      join(home, '.local', 'state', 'purgeit', 'history.jsonl'),
    );
  });

  it('is enabled unless PURGEIT_NO_HISTORY is set', () => {
    expect(historyEnabled({})).toBe(true);
    expect(historyEnabled({ PURGEIT_NO_HISTORY: '1' })).toBe(false);
  });
});

describe('appendHistory / readHistory', () => {
  let dir: string;
  afterEach(() => cleanupTree(dir));

  it('round-trips records newest first, creating the directory and skipping bad lines', async () => {
    dir = mkdtempSync(join(tmpdir(), 'purgeit-history-'));
    const file = join(dir, 'nested', 'history.jsonl');
    await appendHistory([{ schemaVersion: 1, time: 't1', action: 'deleted', path: '/a' }], file);
    await appendHistory([], file);
    await appendHistory(
      [{ schemaVersion: 1, time: 't2', action: 'failed', path: '/b', message: 'boom' }],
      file,
    );
    writeFileSync(file, '{"schemaVersion":2,"path":"/c"}\n{partial', { flag: 'a' });
    expect((await readHistory(file)).map((r) => r.path)).toEqual(['/b', '/a']);
  });

  it('reads a missing history as empty and never throws on an unwritable one', async () => {
    dir = mkdtempSync(join(tmpdir(), 'purgeit-history-'));
    writeFileSync(join(dir, 'file'), 'x');
    expect(await readHistory(join(dir, 'missing.jsonl'))).toEqual([]);
    await expect(
      appendHistory(
        [{ schemaVersion: 1, time: 't', action: 'deleted', path: '/a' }],
        join(dir, 'file', 'h.jsonl'),
      ),
    ).resolves.toBeUndefined();
  });
});
