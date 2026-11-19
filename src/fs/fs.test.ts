import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backdate, blob, buildTree, hardlink } from '../../test/tree.js';
import { hasActivitySince } from './activity.js';
import { createIo, isSkippable } from './io.js';
import { measure } from './measure.js';
import { findProtection, probeTracked } from './protection.js';

const io = createIo();

describe('isSkippable', () => {
  it('skips routine filesystem errors only', () => {
    expect(isSkippable(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(true);
    expect(isSkippable(Object.assign(new Error('x'), { code: 'EMFILE' }))).toBe(false);
    expect(isSkippable('nope')).toBe(false);
  });
});

describe('measure', () => {
  it('counts files, allocated space and the newest modification', async () => {
    const root = buildTree({
      a: { 'one.txt': blob(10_000), deep: { 'two.txt': blob(10_000) } },
      empty: null,
    });
    backdate(root, 10);
    const newest = new Date(Date.now() - 60_000);
    utimesSync(join(root, 'a/deep/two.txt'), newest, newest);

    const result = await measure(root, io);
    expect(result.files).toBe(2);
    expect(result.bytes).toBeGreaterThanOrEqual(20_000);
    expect(Math.abs(result.lastActive - newest.getTime())).toBeLessThan(1500);
  });

  it('never follows symlinks', async () => {
    const outside = buildTree({ 'big.bin': blob(200_000) });
    const root = buildTree({ a: { 'f.txt': 'x' } });
    symlinkSync(outside, join(root, 'a/link'));
    const result = await measure(root, io);
    expect(result.files).toBe(2); // f.txt and the link itself
    expect(result.bytes).toBeLessThan(100_000);
  });

  it('counts a hardlink only when every link lives inside the tree', async () => {
    const outside = buildTree({ 'shared.bin': blob(100_000) });
    const shared = buildTree({ pkg: {} });
    hardlink(join(outside, 'shared.bin'), join(shared, 'pkg/shared.bin'));
    expect((await measure(shared, io)).bytes).toBeLessThan(50_000);

    const inside = buildTree({ pkg: { 'a.bin': blob(100_000) } });
    hardlink(join(inside, 'pkg/a.bin'), join(inside, 'pkg/b.bin'));
    const result = await measure(inside, io);
    expect(result.files).toBe(2);
    expect(result.bytes).toBeGreaterThanOrEqual(100_000);
    expect(result.bytes).toBeLessThan(150_000);
  });

  it('rejects when the root is missing and honours abort', async () => {
    await expect(measure(join(buildTree({}), 'missing'), io)).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(measure(buildTree({ a: { b: 'x' } }), io, controller.signal)).rejects.toThrow();
  });
});

describe('hasActivitySince', () => {
  it('is false for an idle tree and true as soon as anything is newer', async () => {
    const root = buildTree({ a: { b: { 'f.txt': 'x' } } });
    backdate(root, 30);
    const week = Date.now() - 7 * 86_400_000;
    expect(await hasActivitySince(root, week, io)).toBe(false);

    writeFileSync(join(root, 'a/b/f.txt'), 'changed');
    expect(await hasActivitySince(root, week, io)).toBe(true);
  });

  it('counts the directory itself and rejects on unreadable paths', async () => {
    const root = buildTree({ a: 'x' });
    expect(await hasActivitySince(root, 0, io)).toBe(true);
    await expect(hasActivitySince(join(root, 'nope'), 0, io)).rejects.toThrow();
  });
});

describe('findProtection', () => {
  it('protects a nested repository', async () => {
    const dir = buildTree({ vendor: { lib: { '.git': { HEAD: 'ref' } } } });
    expect(await findProtection(dir, io)).toBe('nested-repository');
  });

  it('protects deploy keypairs up to three levels down, not four', async () => {
    const near = buildTree({ deploy: { 'prog-keypair.json': '[]' } });
    expect(await findProtection(near, io)).toBe('deploy-keypair');
    const far = buildTree({ a: { b: { c: { 'prog-keypair.json': '[]' } } } });
    expect(await findProtection(far, io)).toBeUndefined();
  });

  it('protects files tracked by git and leaves untracked ones alone', async () => {
    const repo = buildTree({ app: { dist: { 'keep.js': 'x' }, out: { 'gen.js': 'x' } } });
    const git = (...args: string[]) =>
      execFileSync('git', [
        '-C',
        join(repo, 'app'),
        '-c',
        'user.email=a@b.c',
        '-c',
        'user.name=n',
        ...args,
      ]);
    git('init', '-q');
    git('add', 'dist/keep.js');
    git('commit', '-qm', 'x');
    expect(await findProtection(join(repo, 'app/dist'), io)).toBe('tracked-files');
    expect(await findProtection(join(repo, 'app/out'), io)).toBeUndefined();
  });

  it('treats a non-repository as unprotected and a broken git as unverified', async () => {
    const plain = buildTree({ dist: { 'a.js': 'x' } });
    expect(await findProtection(join(plain, 'dist'), io)).toBeUndefined();
    expect(await probeTracked(plain, 'definitely-not-git')).toBeUndefined();
    expect(await probeTracked(plain, 'false')).toBe('unverified');
  });

  it('tolerates unreadable and vanished directories', async () => {
    const dir = buildTree({ a: null });
    mkdirSync(join(dir, 'b'));
    expect(await findProtection(join(dir, 'missing'), io)).toBeUndefined();
  });
});
