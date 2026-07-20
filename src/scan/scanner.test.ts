import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { defaultRuleSet, mergeRuleSets } from '../rules/merge.js';
import type { ResolvedRuleSet } from '../types.js';
import type { ScanEvent, ScanOptions } from './scanner.js';
import { scan } from './scanner.js';

async function collect(
  root: string,
  opts?: ScanOptions,
  ruleSet: ResolvedRuleSet = defaultRuleSet(),
): Promise<ScanEvent[]> {
  const events: ScanEvent[] = [];
  for await (const event of scan(root, ruleSet, opts)) {
    events.push(event);
  }
  return events;
}

describe('scan (flat mode)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('emits found before size for each match, then done with the summed total', async () => {
    root = buildTree({
      node_modules: { pkg: { 'index.js': 'x'.repeat(1000) } },
      dist: { 'out.js': 'y'.repeat(500) },
    });
    const events = await collect(root, { mode: 'flat' });

    const found = events.filter((e) => e.type === 'found');
    const sizes = events.filter((e) => e.type === 'size');
    const done = events.find((e) => e.type === 'done');

    expect(found).toHaveLength(2);
    expect(sizes).toHaveLength(2);
    expect(done?.type).toBe('done');

    const summed = sizes.reduce((sum, e) => (e.type === 'size' ? sum + e.bytes : sum), 0);
    expect(done && done.type === 'done' ? done.totalBytes : -1).toBe(summed);
    expect(summed).toBeGreaterThan(0);

    for (const s of sizes) {
      if (s.type !== 'size') continue;
      const foundIndex = events.findIndex((e) => e.type === 'found' && e.entry.path === s.path);
      expect(foundIndex).toBeLessThan(events.indexOf(s));
    }
  });

  it('emits just done with totalBytes 0 for a tree with nothing to clean', async () => {
    root = buildTree({ 'readme.txt': 'hi' });
    const events = await collect(root, { mode: 'flat' });
    expect(events).toEqual([{ type: 'done', totalBytes: 0 }]);
  });

  it('honors maxDepth, not descending past the configured level', async () => {
    root = buildTree({ packages: { a: { node_modules: null } } });
    const events = await collect(root, { mode: 'flat', maxDepth: 1 });
    expect(events.filter((e) => e.type === 'found')).toEqual([]);
  });

  it('stops promptly when passed an already-aborted signal', async () => {
    root = buildTree({ node_modules: null });
    const controller = new AbortController();
    controller.abort();
    const events = await collect(root, { mode: 'flat', signal: controller.signal });
    expect(events).toEqual([{ type: 'done', totalBytes: 0 }]);
  });

  it('stops mid-scan once aborted, without processing further matches', async () => {
    root = buildTree({ node_modules: null, dist: null, coverage: null, '.cache': null });
    const controller = new AbortController();
    const events: ScanEvent[] = [];
    let aborted = false;
    for await (const event of scan(root, defaultRuleSet(), {
      mode: 'flat',
      signal: controller.signal,
    })) {
      events.push(event);
      if (!aborted && event.type === 'found') {
        aborted = true;
        controller.abort();
      }
    }
    const found = events.filter((e) => e.type === 'found');
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.length).toBeLessThan(4);
  });
});

describe('scan (projects mode, default)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('emits a project-start with a detected label per top-level project, and scopes matches to it', async () => {
    root = buildTree({
      'proj-a': { 'package.json': '{"name":"a"}', node_modules: null },
      'proj-b': { 'Cargo.toml': '[package]\nname="b"\n', target: null },
    });
    const events = await collect(root);

    const starts = events.filter((e) => e.type === 'project-start');
    expect(starts).toEqual(
      expect.arrayContaining([
        { type: 'project-start', project: 'proj-a', label: 'node' },
        { type: 'project-start', project: 'proj-b', label: 'rust' },
      ]),
    );

    const found = events.filter((e) => e.type === 'found');
    const projects = found.map((e) => (e.type === 'found' ? e.entry.project : null)).sort();
    expect(projects).toEqual(['proj-a', 'proj-b']);
  });

  it('honors maxDepth within each project too', async () => {
    root = buildTree({ proj: { a: { b: { node_modules: null } } } });
    const events = await collect(root, { maxDepth: 1 });
    expect(events.filter((e) => e.type === 'found')).toEqual([]);
  });

  it('ignores top-level files and symlinked directories as project candidates', async () => {
    root = buildTree({ 'README.md': 'hi', real: { node_modules: null } });
    const { symlinkSync } = await import('node:fs');
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const events = await collect(root);
    const starts = events
      .filter((e) => e.type === 'project-start')
      .map((e) => (e.type === 'project-start' ? e.project : null));
    expect(starts).toEqual(['real']);
  });

  it('excludes skipDirs from project discovery', async () => {
    root = buildTree({ archive: { node_modules: null }, real: { node_modules: null } });
    const ruleSet = mergeRuleSets(defaultRuleSet(), { skipDirs: ['archive'] });
    const events = await collect(root, undefined, ruleSet);
    const starts = events
      .filter((e) => e.type === 'project-start')
      .map((e) => (e.type === 'project-start' ? e.project : null));
    expect(starts).toEqual(['real']);
  });

  it('honors targetProject, scanning only the named project', async () => {
    root = buildTree({ a: { node_modules: null }, b: { node_modules: null } });
    const events = await collect(root, { targetProject: 'a' });
    const starts = events.filter((e) => e.type === 'project-start');
    expect(starts).toEqual([{ type: 'project-start', project: 'a', label: '' }]);
    const found = events.filter((e) => e.type === 'found');
    expect(found).toHaveLength(1);
  });

  it('emits a warning event for a malformed manifest', async () => {
    root = buildTree({ broken: { 'package.json': '{not json', node_modules: null } });
    const events = await collect(root);
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.type === 'warning' && warnings[0].warning.message).toMatch(/invalid JSON/);
  });

  it('returns just done when the root itself is unreadable', async () => {
    root = buildTree({});
    const events = await collect(join(root, 'does-not-exist'));
    expect(events).toEqual([{ type: 'done', totalBytes: 0 }]);
  });

  it('stops promptly when passed an already-aborted signal', async () => {
    root = buildTree({ proj: { node_modules: null } });
    const controller = new AbortController();
    controller.abort();
    const events = await collect(root, { signal: controller.signal });
    expect(events).toEqual([{ type: 'done', totalBytes: 0 }]);
  });

  it('skips pending size computations once aborted mid-scan', async () => {
    // All matches are siblings in one directory, so walk() discovers (and
    // queues) every one of them synchronously, before any of their size
    // computations complete. With concurrency 1, only the first size task
    // actually starts; the rest sit queued behind it in p-limit, so aborting
    // right after the first 'found' event reliably lands before p-limit
    // hands the queued tasks their turn.
    root = buildTree({
      proj: {
        'package.json': '{}',
        node_modules: null,
        dist: null,
        coverage: null,
        '.cache': null,
      },
    });
    const controller = new AbortController();
    const events: ScanEvent[] = [];
    let aborted = false;
    for await (const event of scan(root, defaultRuleSet(), {
      signal: controller.signal,
      concurrency: 1,
    })) {
      events.push(event);
      if (!aborted && event.type === 'found') {
        aborted = true;
        controller.abort();
      }
    }
    const found = events.filter((e) => e.type === 'found');
    const sizes = events.filter((e) => e.type === 'size');
    expect(found.length).toBeGreaterThan(1);
    expect(sizes.length).toBeLessThan(found.length);
    const done = events.find((e) => e.type === 'done');
    const summed = sizes.reduce((sum, e) => (e.type === 'size' ? sum + e.bytes : sum), 0);
    expect(done && done.type === 'done' ? done.totalBytes : -1).toBe(summed);
  });

  it('runs the next.js validator and reports no warning for a well-formed project', async () => {
    root = buildTree({
      app: {
        'package.json': '{"name":"x"}',
        'next.config.js': 'module.exports = {}',
        node_modules: null,
      },
    });
    const events = await collect(root);
    expect(events.filter((e) => e.type === 'warning')).toEqual([]);
    expect(events.filter((e) => e.type === 'project-start')).toEqual([
      { type: 'project-start', project: 'app', label: 'next' },
    ]);
  });

  it('runs the tauri Cargo.toml validator', async () => {
    root = buildTree({
      app: {
        'package.json': '{"name":"x"}',
        'src-tauri': { 'Cargo.toml': 'not a real manifest\n' },
      },
    });
    const events = await collect(root);
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.type === 'warning' && warnings[0].warning.message).toMatch(/missing/);
  });

  it('runs the SPM Package.swift validator', async () => {
    root = buildTree({ app: { 'Package.swift': 'not swift' } });
    const events = await collect(root);
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.type === 'warning' && warnings[0].warning.message).toMatch(/malformed/);
  });

  it('runs the Xcode project.pbxproj validator when a .xcodeproj is present', async () => {
    root = buildTree({ app: { 'App.xcodeproj': null } });
    const events = await collect(root);
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.type === 'warning' && warnings[0].warning.message).toMatch(
      /project\.pbxproj/,
    );
  });

  it('skips the Xcode validator when no .xcodeproj is actually present at the top level', async () => {
    // react-native projects can be labeled 'xcode'-adjacent only via ios/Podfile,
    // not a top-level .xcodeproj, so findTopLevelMatchName legitimately returns
    // undefined for the xcode branch here — no crash, no warning from that branch.
    root = buildTree({
      app: { 'package.json': '{"name":"x"}', ios: { Podfile: 'platform :ios\n' } },
    });
    const events = await collect(root);
    expect(events.filter((e) => e.type === 'warning')).toEqual([]);
  });

  it('runs the react-native Podfile validator', async () => {
    root = buildTree({ app: { 'package.json': '{"name":"x"}', ios: { Podfile: 'nonsense\n' } } });
    const events = await collect(root);
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings.some((w) => w.type === 'warning' && /malformed/.test(w.warning.message))).toBe(
      true,
    );
  });
});
