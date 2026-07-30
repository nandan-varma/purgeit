import { afterEach, describe, expect, it, vi } from 'vitest';

// A match's lastModified stat() call can fail (e.g. the directory is removed
// between being matched and stat()'d) — handleMatch's `.catch(() => {})`
// swallows it silently, the same way scan()'s size computation already
// tolerates a failure for one match without aborting the whole scan. This is
// hard to trigger deterministically against a real filesystem, so `stat` is
// mocked to always reject instead (readdir/lstat stay real, so discovery and
// `du`'s pure-Node fallback both still work normally).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: vi.fn().mockRejectedValue(new Error('stat failed')) };
});

const { buildTree, cleanupTree } = await import('../../test/fixtures/build-tmp-tree.js');
const { defaultRuleSet } = await import('../rules/merge.js');
const { scan } = await import('./scanner.js');

describe("scan when a match's stat() call fails", () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('still completes discovery and never emits a lastModified event for it', async () => {
    root = buildTree({ node_modules: null });
    const events = [];
    for await (const event of scan(root, defaultRuleSet(), { mode: 'flat' })) {
      events.push(event);
    }
    expect(events.some((e) => e.type === 'found')).toBe(true);
    expect(events.some((e) => e.type === 'lastModified')).toBe(false);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});
