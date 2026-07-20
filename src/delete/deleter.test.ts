import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { deleteEntries } from './deleter.js';

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
    expect(events[1]).toEqual({ type: 'deleted', path: a, dryRun: false });
    expect(events[2]).toEqual({ type: 'deleting', path: b });
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
});
