import { existsSync, renameSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backdate, buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { DEFAULT_IDLE_MS, deleteEntries } from './deleter.js';
import { readHistory } from './history.js';

async function collect(paths: readonly string[], opts?: Parameters<typeof deleteEntries>[1]) {
  const events = [];
  for await (const event of deleteEntries(paths, opts)) {
    events.push(event);
  }
  return events;
}

describe('deleteEntries', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('deletes each path for real and reports done counts', async () => {
    root = buildTree({ a: { f: 'x' }, b: { f: 'y' } });
    const a = join(root, 'a');
    const b = join(root, 'b');
    const events = await collect([a, b]);

    expect(events[0]).toEqual({ type: 'deleting', path: a });
    expect(events[1]).toEqual({ type: 'deleting', path: b });
    expect(events[2]).toEqual({ type: 'deleted', path: a, dryRun: false });
    expect(events[3]).toEqual({ type: 'deleted', path: b, dryRun: false });
    expect(events[4]).toEqual({ type: 'done', deleted: 2, failed: 0 });

    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(false);
  });

  it('dry-run mode reports deleted without touching the filesystem', async () => {
    root = buildTree({ a: { f: 'x' } });
    const a = join(root, 'a');
    const events = await collect([a], { dryRun: true });

    expect(events).toEqual([
      { type: 'deleting', path: a },
      { type: 'deleted', path: a, dryRun: true },
      { type: 'done', deleted: 1, failed: 0 },
    ]);
    expect(existsSync(a)).toBe(true);
  });

  it('a path that no longer exists is treated as already deleted (force: true)', async () => {
    root = buildTree({});
    const missing = join(root, 'does-not-exist');
    const events = await collect([missing]);
    expect(events).toEqual([
      { type: 'deleting', path: missing },
      { type: 'deleted', path: missing, dryRun: false },
      { type: 'done', deleted: 1, failed: 0 },
    ]);
  });

  it('continues past a real failure and aggregates deleted vs failed counts in one batch', async () => {
    if (process.getuid?.() === 0) return; // root bypasses permission checks
    if (process.platform === 'win32') return; // chmod has no effect on NTFS
    root = buildTree({ locked: { child: { f: 'x' } }, real: { f: 'y' } });
    const { chmodSync } = await import('node:fs');
    const lockedDir = join(root, 'locked');
    const lockedChild = join(lockedDir, 'child');
    const real = join(root, 'real');
    chmodSync(lockedDir, 0o500); // read+execute but no write -> can't unlink children
    try {
      const events = await collect([lockedChild, real]);
      const errorEvent = events.find((e) => e.type === 'error');
      const doneEvent = events.find((e) => e.type === 'done');
      expect(errorEvent).toBeDefined();
      expect(doneEvent).toEqual({ type: 'done', deleted: 1, failed: 1 });
      expect(existsSync(real)).toBe(false);
      expect(existsSync(lockedChild)).toBe(true);
    } finally {
      chmodSync(lockedDir, 0o700);
    }
  });

  it('refuses to delete the filesystem root', async () => {
    const events = await collect(['/']);
    expect(events).toEqual([
      { type: 'deleting', path: '/' },
      { type: 'error', path: '/', message: 'refusing to delete filesystem root or home directory' },
      { type: 'done', deleted: 0, failed: 1 },
    ]);
  });

  it('refuses to delete the home directory', async () => {
    const events = await collect([homedir()]);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.type === 'error' && errorEvent.message).toMatch(/refusing to delete/);
  });

  it('stops before processing further paths once aborted', async () => {
    root = buildTree({ a: { f: 'x' }, b: { f: 'y' } });
    const a = join(root, 'a');
    const b = join(root, 'b');
    const controller = new AbortController();
    controller.abort();
    const events = await collect([a, b], { signal: controller.signal });
    expect(events).toEqual([{ type: 'done', deleted: 0, failed: 0 }]);
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(true);
  });

  it('stops mid-batch when the signal is aborted between chunks', async () => {
    root = buildTree({ a: { f: 'x' }, b: { f: 'y' } });
    const a = join(root, 'a');
    const b = join(root, 'b');
    const controller = new AbortController();
    const events = [];
    for await (const event of deleteEntries([a, b], {
      signal: controller.signal,
      concurrency: 1,
    })) {
      events.push(event);
      if (event.type === 'deleted' && event.path === a) {
        controller.abort();
      }
    }
    expect(events).toEqual([
      { type: 'deleting', path: a },
      { type: 'deleted', path: a, dryRun: false },
      { type: 'done', deleted: 1, failed: 0 },
    ]);
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(true);
  });

  it('deletes a path inside the given roots, including through a symlinked root', async () => {
    root = buildTree({ real: { proj: { node_modules: { f: 'x' } } } });
    symlinkSync(join(root, 'real'), join(root, 'alias'));
    const target = join(root, 'real', 'proj', 'node_modules');
    const events = await collect([target], { roots: [join(root, 'alias')] });
    expect(events.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 0 });
    expect(existsSync(target)).toBe(false);
  });

  it('refuses a path whose ancestor was swapped for a symlink leading outside the roots', async () => {
    root = buildTree({ scanned: { proj: {} }, victim: { node_modules: { keep: 'x' } } });
    const proj = join(root, 'scanned', 'proj');
    renameSync(proj, join(root, 'moved'));
    symlinkSync(join(root, 'victim'), proj);
    const events = await collect([join(proj, 'node_modules')], { roots: [join(root, 'scanned')] });
    expect(events).toContainEqual({
      type: 'error',
      path: join(proj, 'node_modules'),
      message: 'refusing to delete a path that resolves outside the scanned roots',
    });
    expect(existsSync(join(root, 'victim', 'node_modules', 'keep'))).toBe(true);
  });

  it('refuses a root itself and a path that no longer exists', async () => {
    root = buildTree({ proj: {} });
    const events = await collect([root, join(root, 'gone')], { roots: [root] });
    expect(events.filter((e) => e.type === 'error')).toHaveLength(2);
  });

  it('refuses a recently active path under idleForMs, even in a dry run, and deletes an idle one', async () => {
    root = buildTree({ fresh: { f: 'x' }, old: { f: 'x' } });
    backdate(join(root, 'old'));
    const events = await collect([join(root, 'fresh'), join(root, 'old')], {
      idleForMs: DEFAULT_IDLE_MS,
      dryRun: true,
    });
    expect(events).toContainEqual({
      type: 'error',
      path: join(root, 'fresh'),
      message:
        'skipped: modified within the last 1w (lower the window with --min-age, 0 to disable)',
    });
    expect(events).toContainEqual({ type: 'deleted', path: join(root, 'old'), dryRun: true });
  });

  it('refuses a path whose activity cannot be checked, and skips the guard at 0', async () => {
    root = buildTree({ fresh: { f: 'x' } });
    const missing = await collect([join(root, 'missing')], { idleForMs: DEFAULT_IDLE_MS });
    expect(missing[1]).toMatchObject({
      type: 'error',
      message: expect.stringContaining('could not check'),
    });
    const off = await collect([join(root, 'fresh')], { idleForMs: 0 });
    expect(off.at(-1)).toEqual({ type: 'done', deleted: 1, failed: 0 });
  });

  it('records real outcomes to the history when asked, but not dry runs or when disabled', async () => {
    root = buildTree({ a: { f: 'x' }, b: { f: 'x' }, c: { f: 'x' } });
    const file = join(root, 'history.jsonl');
    const saved = { ...process.env };
    process.env.PURGEIT_HISTORY_FILE = file;
    delete process.env.PURGEIT_NO_HISTORY;
    try {
      await collect([join(root, 'a'), root], { recordHistory: true, roots: [root] });
      await collect([join(root, 'b')], { recordHistory: true, dryRun: true });
      await collect([join(root, 'c')]);
      process.env.PURGEIT_NO_HISTORY = '1';
      await collect([join(root, 'c')], { recordHistory: true });
    } finally {
      process.env = saved;
    }
    const records = await readHistory(file);
    // Newest first: both outcomes come from one chunk, written in input order.
    expect(records.map((r) => [r.action, r.path])).toEqual([
      ['failed', root],
      ['deleted', join(root, 'a')],
    ]);
    expect(records.find((r) => r.action === 'failed')?.message).toMatch(/refusing|outside/);
  });

  it('treats a root that no longer exists as containing nothing, without an unhandled rejection', async () => {
    root = buildTree({ proj: { dist: { f: 'x' } } });
    const events = await collect([join(root, 'proj', 'dist')], { roots: [join(root, 'gone')] });
    expect(events).toContainEqual({
      type: 'error',
      path: join(root, 'proj', 'dist'),
      message: 'refusing to delete a path that resolves outside the scanned roots',
    });
    expect(await collect([], { roots: [join(root, 'gone')] })).toEqual([
      { type: 'done', deleted: 0, failed: 0 },
    ]);
  });
});
