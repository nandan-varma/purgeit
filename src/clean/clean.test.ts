import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { backdate, blob, buildTree } from '../../test/tree.js';
import { createRuleSet } from '../rules/rule-set.js';
import { clean, type CleanEvent, type Target } from './clean.js';
import { appendHistory, readHistory } from './history.js';

const rules = createRuleSet();

async function run(
  targets: readonly Target[],
  options: Parameters<typeof clean>[1],
): Promise<CleanEvent[]> {
  const events: CleanEvent[] = [];
  for await (const event of clean(targets, options)) events.push(event);
  return events;
}

const outcome = (events: CleanEvent[], path: string) =>
  events.find((event) => 'path' in event && event.path === path && event.type !== 'start');

function fixture() {
  const root = buildTree({
    app: { 'package.json': '{}', node_modules: { 'a.js': blob(1000) }, src: { 'index.ts': 'x' } },
  });
  backdate(root);
  return { root, modules: join(root, 'app/node_modules') };
}

describe('clean', () => {
  it('deletes what the rules still claim and reports the bytes', async () => {
    const { root, modules } = fixture();
    const events = await run([{ path: modules, bytes: 1000 }], { rules, roots: [root] });
    expect(existsSync(modules)).toBe(false);
    expect(outcome(events, modules)).toMatchObject({ type: 'deleted', bytes: 1000, dryRun: false });
    expect(events.at(-1)).toEqual({
      type: 'done',
      summary: { deleted: 1, refused: 0, failed: 0, bytes: 1000, dryRun: false },
    });
  });

  it('deletes nothing on a dry run but runs every check', async () => {
    const { root, modules } = fixture();
    const events = await run([{ path: modules, bytes: 5 }], { rules, roots: [root], dryRun: true });
    expect(existsSync(modules)).toBe(true);
    expect(outcome(events, modules)).toMatchObject({ type: 'deleted', dryRun: true });

    const refused = await run([{ path: join(root, 'app/src') }], {
      rules,
      roots: [root],
      dryRun: true,
    });
    expect(outcome(refused, join(root, 'app/src'))).toMatchObject({ type: 'refused' });
  });

  it.each([
    ['a directory no rule claims', (r: string) => join(r, 'app/src'), 'no-longer-matches'],
    ['a path that does not exist', (r: string) => join(r, 'app/gone/node_modules'), 'missing'],
  ])('refuses %s', async (_label, pick, code) => {
    const { root } = fixture();
    const path = pick(root);
    const events = await run([{ path }], { rules, roots: [root] });
    expect(outcome(events, path)).toMatchObject({ type: 'refused', refusal: { code } });
  });

  it('refuses the filesystem root, the home directory, and anything outside the roots', async () => {
    const { root } = fixture();
    const elsewhere = buildTree({ node_modules: { x: 'x' } });
    backdate(elsewhere);
    const events = await run(
      [{ path: '/' }, { path: elsewhere }, { path: join(elsewhere, 'node_modules') }],
      { rules, roots: [root] },
    );
    expect(outcome(events, '/')).toMatchObject({ refusal: { code: 'dangerous' } });
    expect(outcome(events, elsewhere)).toMatchObject({ refusal: { code: 'outside-roots' } });
    expect(outcome(events, join(elsewhere, 'node_modules'))).toMatchObject({
      refusal: { code: 'outside-roots' },
    });
    expect(existsSync(join(elsewhere, 'node_modules'))).toBe(true);
  });

  it('refuses a path swapped for a symlink, even to another claimed directory', async () => {
    const { root } = fixture();
    const outside = buildTree({ node_modules: { x: 'x' } });
    const swapped = join(root, 'app/swapped');
    mkdirSync(swapped);
    symlinkSync(join(outside, 'node_modules'), join(swapped, 'node_modules'));
    const events = await run([{ path: join(swapped, 'node_modules') }], { rules, roots: [root] });
    expect(outcome(events, join(swapped, 'node_modules'))).toMatchObject({ type: 'refused' });
    expect(existsSync(join(outside, 'node_modules/x'))).toBe(true);
  });

  it('cannot be tricked with traversal segments or a symlinked ancestor that leaves the roots', async () => {
    const { root } = fixture();
    const outside = buildTree({ victim: { node_modules: { 'keep.js': 'precious' } } });
    backdate(outside);
    symlinkSync(join(outside, 'victim'), join(root, 'app', 'portal'));
    const sneaky = [
      join(root, 'app', '..', '..', outside.split('/').at(-1) ?? '', 'victim', 'node_modules'),
      join(root, 'app', 'portal', 'node_modules'), // ancestor is a symlink out of the roots
      `${join(root, 'app')}/node_modules/../../../../..`,
    ];
    const events = await run(
      sneaky.map((path) => ({ path })),
      { rules, roots: [root] },
    );
    for (const path of sneaky) {
      expect(
        events.find((e) => 'path' in e && e.path === path && e.type === 'deleted'),
      ).toBeUndefined();
    }
    expect(existsSync(join(outside, 'victim', 'node_modules', 'keep.js'))).toBe(true);
    expect(existsSync(root)).toBe(true);
  });

  it('follows a symlinked ancestor that stays inside the roots, deleting the verified real path', async () => {
    const { root, modules } = fixture();
    symlinkSync(join(root, 'app'), join(root, 'alias'));
    const viaAlias = join(root, 'alias', 'node_modules');
    const events = await run([{ path: viaAlias, bytes: 1 }], { rules, roots: [root] });
    expect(outcome(events, viaAlias)).toMatchObject({ type: 'deleted' });
    expect(existsSync(modules)).toBe(false);
    expect(existsSync(join(root, 'app'))).toBe(true);
  });

  it('refuses protected content', async () => {
    const root = buildTree({
      app: { 'Cargo.toml': '', target: { deploy: { 'p-keypair.json': '[]' } } },
    });
    backdate(root);
    const path = join(root, 'app/target');
    const events = await run([{ path }], { rules, roots: [root] });
    expect(outcome(events, path)).toMatchObject({ refusal: { code: 'protected' } });
    expect(existsSync(path)).toBe(true);
  });

  it('refuses recently active artifacts, and ones changed since the scan', async () => {
    const { root, modules } = fixture();
    const idle = 7 * 86_400_000;
    expect(
      outcome(await run([{ path: modules }], { rules, roots: [root], idleFor: idle }), modules),
    ).toMatchObject({
      type: 'deleted',
    });

    const again = fixture();
    writeFileSync(join(again.modules, 'new.js'), 'fresh');
    expect(
      outcome(
        await run([{ path: again.modules }], { rules, roots: [again.root], idleFor: idle }),
        again.modules,
      ),
    ).toMatchObject({
      refusal: { code: 'recently-active' },
    });

    const scanned = fixture();
    const stale = Date.now() - 40 * 86_400_000;
    const events = await run([{ path: scanned.modules, unchangedSince: stale }], {
      rules,
      roots: [scanned.root],
    });
    expect(outcome(events, scanned.modules)).toMatchObject({
      refusal: { code: 'changed-since-scan' },
    });
    const ok = await run([{ path: scanned.modules, unchangedSince: Date.now() }], {
      rules,
      roots: [scanned.root],
    });
    expect(outcome(ok, scanned.modules)).toMatchObject({ type: 'deleted' });
  });

  it('keeps going after a refusal and tallies everything', async () => {
    const { root, modules } = fixture();
    const events = await run([{ path: join(root, 'app/src') }, { path: modules, bytes: 7 }], {
      rules,
      roots: [root],
    });
    expect(events.at(-1)).toMatchObject({
      summary: { deleted: 1, refused: 1, failed: 0, bytes: 7 },
    });
  });

  it('records deletions in the history, never on dry runs', async () => {
    const { root, modules } = fixture();
    const history = join(buildTree({}), 'logs', 'history.jsonl');
    await run([{ path: modules, bytes: 9 }], {
      rules,
      roots: [root],
      dryRun: true,
      historyFile: history,
    });
    expect(await readHistory(history)).toEqual([]);
    await run([{ path: modules, bytes: 9 }], { rules, roots: [root], historyFile: history });
    expect(await readHistory(history)).toMatchObject([
      { action: 'deleted', path: modules, bytes: 9 },
    ]);
  });

  it('warns once, and still deletes, when the history cannot be written', async () => {
    const { root, modules } = fixture();
    const blocked = join(buildTree({ file: 'x' }), 'file', 'history.jsonl');
    const events = await run([{ path: modules }], { rules, roots: [root], historyFile: blocked });
    expect(events.filter((event) => event.type === 'warning')).toHaveLength(1);
    expect(existsSync(modules)).toBe(false);
  });

  it('stops starting new deletions once aborted', async () => {
    const { root, modules } = fixture();
    const controller = new AbortController();
    controller.abort();
    const events = await run([{ path: modules }], {
      rules,
      roots: [root],
      signal: controller.signal,
    });
    expect(existsSync(modules)).toBe(true);
    expect(events).toEqual([
      { type: 'done', summary: { deleted: 0, refused: 0, failed: 0, bytes: 0, dryRun: false } },
    ]);
  });
});

describe('history', () => {
  it('returns newest first, tolerating torn lines and a missing file', async () => {
    const dir = buildTree({});
    const file = join(dir, 'h.jsonl');
    expect(await readHistory(file)).toEqual([]);
    await appendHistory(file, [
      { time: '2026-01-01T00:00:00.000Z', action: 'deleted', path: '/a' },
    ]);
    await appendHistory(file, [
      { time: '2026-01-02T00:00:00.000Z', action: 'failed', path: '/b', message: 'EBUSY' },
    ]);
    writeFileSync(file, `${(await import('node:fs')).readFileSync(file, 'utf8')}{"time":"2026\n\n`);
    expect((await readHistory(file)).map((record) => record.path)).toEqual(['/b', '/a']);
    await appendHistory(file, []);
  });

  it('propagates read errors other than a missing file', async () => {
    await expect(readHistory(buildTree({}))).rejects.toThrow();
  });
});
