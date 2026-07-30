import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import type { CloudDeleteEvent, CloudResource, CloudScanEvent } from '../providers/types.js';
import type { ParsedCli } from './args.js';

const discoverMock = vi.fn<(opts: unknown) => AsyncGenerator<CloudScanEvent>>();
const deleteMock = vi.fn<(resources: unknown, opts: unknown) => AsyncGenerator<CloudDeleteEvent>>();
const loadProviderMock = vi.fn(async (id: 'aws' | 'gcp') => ({
  id,
  discover: discoverMock,
  delete: deleteMock,
}));

vi.mock('../providers/registry.js', () => ({
  loadProvider: (id: 'aws' | 'gcp') => loadProviderMock(id),
}));

const { runHeadlessCloud } = await import('./headless-cloud.js');

function resource(overrides: Partial<CloudResource> = {}): CloudResource {
  return {
    id: 'arn:aws:cloudformation:us-east-1:123:stack/my-stack/abc',
    provider: 'aws',
    resourceType: 'cloudformation-stack',
    label: 'my-stack',
    project: 'us-east-1',
    region: 'us-east-1',
    tags: { 'purgeit-managed': 'true' },
    createdAt: null,
    cost: null,
    ...overrides,
  };
}

function baseArgs(overrides: Partial<ParsedCli> = {}): ParsedCli {
  return {
    directory: '.',
    full: false,
    project: undefined,
    exclude: [],
    targets: [],
    minSize: undefined,
    minAge: undefined,
    maxAge: undefined,
    depth: undefined,
    provider: 'aws',
    region: undefined,
    awsProfile: undefined,
    gcpProject: undefined,
    tags: [],
    withCost: false,
    configPath: undefined,
    noConfig: true,
    noGated: false,
    sort: 'size',
    ascending: false,
    dryRun: false,
    delete: false,
    yes: false,
    json: false,
    tui: false,
    headless: true,
    concurrency: 8,
    color: undefined,
    ...overrides,
  };
}

function captureIO() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
  };
}

async function* found(...resources: CloudResource[]): AsyncGenerator<CloudScanEvent> {
  for (const r of resources) yield { type: 'found', resource: r };
  yield { type: 'done' };
}

describe('runHeadlessCloud', () => {
  afterEach(() => {
    discoverMock.mockReset();
    deleteMock.mockReset();
    loadProviderMock.mockClear();
  });

  it('rejects a directly-called provider of "local" (internal invariant)', async () => {
    const io = captureIO();
    await expect(runHeadlessCloud(baseArgs({ provider: 'local' }), io)).rejects.toThrow(
      /internal error/,
    );
  });

  it('prints a preview and exits 0 when resources are found', async () => {
    discoverMock.mockImplementation(() => found(resource()));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs(), io);
    expect(code).toBe(0);
    expect(io.out.some((l) => l.includes('my-stack'))).toBe(true);
    expect(io.out.some((l) => l.includes('Run with --delete'))).toBe(true);
  });

  it('exits 1 and prints "Nothing to clean." when nothing is found', async () => {
    discoverMock.mockImplementation(() => found());
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs(), io);
    expect(code).toBe(1);
    expect(io.out).toContain('Nothing to clean.');
  });

  it('emits JSON when --json is passed', async () => {
    discoverMock.mockImplementation(() => found(resource()));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ json: true }), io);
    expect(code).toBe(0);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.provider).toBe('aws');
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].id).toBe(resource().id);
    expect(payload.entries[0].cost).toBeNull();
  });

  it('exits 1 with --json when nothing is found', async () => {
    discoverMock.mockImplementation(() => found());
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ json: true }), io);
    expect(code).toBe(1);
  });

  it('propagates a discover() failure as exit code 2', async () => {
    // biome-ignore lint/correctness/useYield: mock intentionally throws without yielding to test error path
    discoverMock.mockImplementation(async function* (): AsyncGenerator<CloudScanEvent> {
      throw new Error('AccessDenied');
    });
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs(), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/AccessDenied/);
  });

  it('propagates a loadProvider() failure as exit code 2', async () => {
    loadProviderMock.mockRejectedValueOnce(new Error('AWS support requires the AWS SDK'));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs(), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/AWS support requires/);
  });

  it('rejects an invalid --min-age string with exit code 2', async () => {
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ minAge: 'not-a-duration' }), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid duration/);
  });

  it('rejects an invalid --max-age string with exit code 2', async () => {
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ maxAge: 'not-a-duration' }), io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/invalid duration/);
  });

  it('filters out a resource newer than --min-age', async () => {
    discoverMock.mockImplementation(() => found(resource({ createdAt: Date.now() })));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ minAge: '1d' }), io);
    expect(code).toBe(1);
  });

  it('excludes a resource with unknown age when an age filter is set', async () => {
    discoverMock.mockImplementation(() => found(resource({ createdAt: null })));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ minAge: '1d' }), io);
    expect(code).toBe(1);
  });

  it('keeps a resource older than --min-age', async () => {
    const old = Date.now() - 2 * 86_400_000;
    discoverMock.mockImplementation(() => found(resource({ createdAt: old })));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ minAge: '1d' }), io);
    expect(code).toBe(0);
  });

  it('excludes a resource older than --max-age', async () => {
    const old = Date.now() - 2 * 86_400_000;
    discoverMock.mockImplementation(() => found(resource({ createdAt: old })));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ maxAge: '1d' }), io);
    expect(code).toBe(1);
  });

  it('attaches cost events to their matching resource', async () => {
    discoverMock.mockImplementation(async function* () {
      yield { type: 'found', resource: resource() };
      yield { type: 'cost', id: resource().id, cost: { amountUsd: 12.5, basis: 'billed' } };
      yield { type: 'done' };
    });
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ withCost: true, json: true }), io);
    expect(code).toBe(0);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries[0].cost).toEqual({ amountUsd: 12.5, basis: 'billed' });
  });

  it('marks a list-price-estimate cost with "(est.)" in the text preview', async () => {
    discoverMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        resource: resource({ cost: { amountUsd: 5, basis: 'list-price-estimate' } }),
      };
      yield { type: 'done' };
    });
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs(), io);
    expect(code).toBe(0);
    expect(io.out.some((l) => l.includes('(est.)'))).toBe(true);
  });

  it('shows "?" for an unresolved cost in the text preview', async () => {
    discoverMock.mockImplementation(() => found(resource({ cost: null })));
    const io = captureIO();
    await runHeadlessCloud(baseArgs(), io);
    expect(io.out.some((l) => l.includes('?'))).toBe(true);
  });

  it('sorts by name ascending', async () => {
    discoverMock.mockImplementation(() =>
      found(
        resource({ id: 'arn:b', label: 'b-stack' }),
        resource({ id: 'arn:a', label: 'a-stack' }),
      ),
    );
    const io = captureIO();
    await runHeadlessCloud(baseArgs({ sort: 'name', ascending: true, json: true }), io);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries.map((e: { label: string }) => e.label)).toEqual(['a-stack', 'b-stack']);
  });

  it('sorts by size (cost proxy) descending by default', async () => {
    discoverMock.mockImplementation(() =>
      found(
        resource({ id: 'arn:a', label: 'a', cost: { amountUsd: 1, basis: 'billed' } }),
        resource({ id: 'arn:b', label: 'b', cost: { amountUsd: 100, basis: 'billed' } }),
      ),
    );
    const io = captureIO();
    await runHeadlessCloud(baseArgs({ sort: 'size', json: true }), io);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries[0].label).toBe('b');
  });

  it('treats a null cost as 0 when sorting by size', async () => {
    // Array.prototype.sort calls the comparator exactly once for a
    // 2-element array, with the operands in original array order — two
    // orderings are needed to exercise both the null-cost and defined-cost
    // side of each `?? 0` fallback (see headless-null-size.test.ts's
    // sibling reverse-order file for the same pattern on the local path).
    discoverMock.mockImplementation(() =>
      found(
        resource({ id: 'arn:a', label: 'a', cost: null }),
        resource({ id: 'arn:b', label: 'b', cost: { amountUsd: 5, basis: 'billed' } }),
      ),
    );
    const io = captureIO();
    await runHeadlessCloud(baseArgs({ sort: 'size', ascending: true, json: true }), io);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries.map((e: { label: string }) => e.label)).toEqual(['a', 'b']);
  });

  it('treats a null cost as 0 when sorting by size (reverse discovery order)', async () => {
    discoverMock.mockImplementation(() =>
      found(
        resource({ id: 'arn:b', label: 'b', cost: { amountUsd: 5, basis: 'billed' } }),
        resource({ id: 'arn:a', label: 'a', cost: null }),
      ),
    );
    const io = captureIO();
    await runHeadlessCloud(baseArgs({ sort: 'size', ascending: true, json: true }), io);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries.map((e: { label: string }) => e.label)).toEqual(['a', 'b']);
  });

  it('shows a billed (non-estimate) cost in the text preview with no "(est.)" suffix', async () => {
    discoverMock.mockImplementation(() =>
      found(resource({ cost: { amountUsd: 3.5, basis: 'billed' } })),
    );
    const io = captureIO();
    await runHeadlessCloud(baseArgs(), io);
    expect(io.out.some((l) => l.includes('$3.50') && !l.includes('(est.)'))).toBe(true);
  });

  it('sorts by id when sortKey is "path"', async () => {
    discoverMock.mockImplementation(() =>
      found(resource({ id: 'arn:z', label: 'z' }), resource({ id: 'arn:a', label: 'a' })),
    );
    const io = captureIO();
    await runHeadlessCloud(baseArgs({ sort: 'path', ascending: true, json: true }), io);
    const payload = JSON.parse(io.out.join(''));
    expect(payload.entries[0].id).toBe('arn:a');
  });

  it('resolves tags/region/profile from CLI flags over config defaults', async () => {
    discoverMock.mockImplementation(() => found());
    const io = captureIO();
    await runHeadlessCloud(
      baseArgs({
        tags: [{ key: 'env', value: 'dev' }],
        region: 'us-west-2',
        awsProfile: 'dev-profile',
      }),
      io,
    );
    expect(discoverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-west-2',
        profile: 'dev-profile',
        tags: new Map([['env', 'dev']]),
      }),
    );
  });

  it('falls back to the default purgeit-managed=true tag when nothing else is configured', async () => {
    discoverMock.mockImplementation(() => found());
    const io = captureIO();
    await runHeadlessCloud(baseArgs(), io);
    expect(discoverMock).toHaveBeenCalledWith(
      expect.objectContaining({ tags: new Map([['purgeit-managed', 'true']]) }),
    );
  });

  it('resolves a partial cloud.tagKey from config, falling back to the default value', async () => {
    const dir = buildTree({
      'purgeit.config.json': JSON.stringify({ cloud: { tagKey: 'team' } }),
    });
    try {
      discoverMock.mockImplementation(() => found());
      const io = captureIO();
      await runHeadlessCloud(
        baseArgs({ noConfig: false, configPath: join(dir, 'purgeit.config.json') }),
        io,
      );
      expect(discoverMock).toHaveBeenCalledWith(
        expect.objectContaining({ tags: new Map([['team', 'true']]) }),
      );
    } finally {
      cleanupTree(dir);
    }
  });

  it('resolves a partial cloud.tagValue from config, falling back to the default key', async () => {
    const dir = buildTree({
      'purgeit.config.json': JSON.stringify({ cloud: { tagValue: 'yes' } }),
    });
    try {
      discoverMock.mockImplementation(() => found());
      const io = captureIO();
      await runHeadlessCloud(
        baseArgs({ noConfig: false, configPath: join(dir, 'purgeit.config.json') }),
        io,
      );
      expect(discoverMock).toHaveBeenCalledWith(
        expect.objectContaining({ tags: new Map([['purgeit-managed', 'yes']]) }),
      );
    } finally {
      cleanupTree(dir);
    }
  });

  it('returns exit code 2 when config loading fails', async () => {
    const dir = buildTree({
      'purgeit.config.json': JSON.stringify({ cloud: 'not-an-object' }),
    });
    try {
      const io = captureIO();
      const code = await runHeadlessCloud(
        baseArgs({ noConfig: false, configPath: join(dir, 'purgeit.config.json') }),
        io,
      );
      expect(code).toBe(2);
      expect(io.err[0]).toMatch(/"cloud" must be an object/);
    } finally {
      cleanupTree(dir);
    }
  });

  it('aborts the delete flow when the user declines confirmation', async () => {
    discoverMock.mockImplementation(() => found(resource()));
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ delete: true }), {
      ...io,
      confirm: async () => false,
    });
    expect(code).toBe(0);
    expect(io.out).toContain('Aborted.');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('deletes after confirmation and reports the tally', async () => {
    discoverMock.mockImplementation(() => found(resource()));
    deleteMock.mockImplementation(async function* (): AsyncGenerator<CloudDeleteEvent> {
      yield { type: 'deleting', id: resource().id };
      yield { type: 'deleted', id: resource().id, dryRun: false };
      yield { type: 'done', deleted: 1, failed: 0 };
    });
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ delete: true, yes: true }), io);
    expect(code).toBe(0);
    expect(io.out.some((l) => l.includes('deleted: arn:aws'))).toBe(true);
    expect(io.out).toContain('1 deleted, 0 failed');
  });

  it('reports a delete error without aborting the batch', async () => {
    discoverMock.mockImplementation(() => found(resource()));
    deleteMock.mockImplementation(async function* (): AsyncGenerator<CloudDeleteEvent> {
      yield { type: 'deleting', id: resource().id };
      yield { type: 'error', id: resource().id, message: 'permission denied' };
      yield { type: 'done', deleted: 0, failed: 1 };
    });
    const io = captureIO();
    const code = await runHeadlessCloud(baseArgs({ delete: true, yes: true }), io);
    expect(code).toBe(1);
    expect(io.err.some((l) => l.includes('permission denied'))).toBe(true);
  });

  it('uses process.stdout when io.stdout is not provided', async () => {
    discoverMock.mockImplementation(() => found());
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const code = await runHeadlessCloud(baseArgs());
      expect(code).toBe(1);
      expect(stdoutSpy).toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('uses process.stderr when io.stderr is not provided', async () => {
    // biome-ignore lint/correctness/useYield: mock intentionally throws without yielding to test error path
    discoverMock.mockImplementation(async function* (): AsyncGenerator<CloudScanEvent> {
      throw new Error('boom');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const code = await runHeadlessCloud(baseArgs());
      expect(code).toBe(2);
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
