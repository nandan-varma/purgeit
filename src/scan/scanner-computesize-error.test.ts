import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { defaultRuleSet } from '../rules/merge.js';
import type { ScanEvent } from './scanner.js';

// Mock computeSize to throw — exercises the empty catch in scanner.ts:201.
vi.mock('./size.js', async () => {
  const actual = await vi.importActual<typeof import('./size.js')>('./size.js');
  return {
    ...actual,
    computeSize: vi.fn(async () => {
      throw new Error('size boom');
    }),
  };
});

const { scan } = await import('./scanner.js');

async function collect(root: string): Promise<ScanEvent[]> {
  const events: ScanEvent[] = [];
  for await (const event of scan(root, defaultRuleSet(), { mode: 'flat' })) {
    events.push(event);
  }
  return events;
}

describe('scan computeSize error handling', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('completes gracefully when computeSize throws (empty catch)', async () => {
    root = buildTree({ node_modules: { pkg: { 'index.js': 'x'.repeat(100) } } });
    const events = await collect(root);

    const found = events.filter((e) => e.type === 'found');
    const sizes = events.filter((e) => e.type === 'size');
    const done = events.find((e) => e.type === 'done');

    // Match was discovered but size computation failed — no size event emitted.
    expect(found).toHaveLength(1);
    expect(sizes).toHaveLength(0);
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.totalBytes).toBe(0);
    }
  });
});
