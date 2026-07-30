import { Text } from 'ink';
import { render as inkRender } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRuleSet } from '../types.js';
import type { ScanResult } from './result.js';
import type { UseScannerOptions } from './useScanner.js';
import { useScanner } from './useScanner.js';

const scanMock = vi.hoisted(() => vi.fn());

vi.mock('../scan/scanner.js', async () => {
  const actual = await vi.importActual<typeof import('../scan/scanner.js')>('../scan/scanner.js');
  return { ...actual, scan: scanMock };
});

const emptyRuleSet: ResolvedRuleSet = {
  alwaysSafe: new Set(),
  gated: new Map(),
  pruneMeta: new Set(),
  skipDirs: new Set(),
  targets: new Map(),
};

function Harness({
  onResult,
  options,
}: {
  onResult?: (result: ScanResult | null) => void;
  options?: Omit<UseScannerOptions, 'onResult'>;
}) {
  const [state] = useScanner(
    '/root',
    emptyRuleSet,
    { mode: 'flat' },
    {
      ...(options ?? {}),
      onResult,
    },
  );
  return <Text>{state.phase}</Text>;
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('useScanner', () => {
  afterEach(() => {
    scanMock.mockReset();
  });

  it('reports an empty scan via onResult', async () => {
    scanMock.mockImplementation(async function* () {
      yield { type: 'done', totalBytes: 0 };
    });
    const onResult = vi.fn();
    inkRender(<Harness onResult={onResult} />);
    await flush();
    expect(onResult).toHaveBeenCalledWith({ kind: 'empty' });
  });

  it('does not report empty when an entry is found', async () => {
    scanMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/node_modules',
          project: '/root',
          kind: 'always-safe',
          ruleName: 'node_modules',
          size: null,
        },
      };
      yield { type: 'size', path: '/root/node_modules', bytes: 1024 };
      yield { type: 'done', totalBytes: 1024 };
    });
    const onResult = vi.fn();
    const { lastFrame } = inkRender(<Harness onResult={onResult} />);
    await flush();
    expect(onResult).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('ready');
  });

  it('filters entries below --min-size', async () => {
    scanMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/small',
          project: '/root',
          kind: 'always-safe',
          ruleName: 'small',
          size: null,
        },
      };
      yield { type: 'size', path: '/root/small', bytes: 10 };
      yield { type: 'done', totalBytes: 10 };
    });
    const onResult = vi.fn();
    const { lastFrame } = inkRender(
      <Harness onResult={onResult} options={{ minSizeBytes: 100 }} />,
    );
    await flush();
    expect(onResult).toHaveBeenCalledWith({ kind: 'empty' });
    expect(lastFrame()).toContain('done');
  });

  it('keeps entries at or above --min-size', async () => {
    scanMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/big',
          project: '/root',
          kind: 'always-safe',
          ruleName: 'big',
          size: null,
        },
      };
      yield { type: 'size', path: '/root/big', bytes: 100 };
      yield { type: 'done', totalBytes: 100 };
    });
    const onResult = vi.fn();
    const { lastFrame } = inkRender(
      <Harness onResult={onResult} options={{ minSizeBytes: 100 }} />,
    );
    await flush();
    expect(onResult).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('ready');
  });

  it('updates lastModified on an already-added entry', async () => {
    scanMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/node_modules',
          project: '/root',
          kind: 'always-safe',
          ruleName: 'node_modules',
          size: null,
          lastModified: null,
        },
      };
      yield { type: 'lastModified', path: '/root/node_modules', mtimeMs: 12345 };
      yield { type: 'done', totalBytes: 0 };
    });
    const onResult = vi.fn();
    const { lastFrame } = inkRender(<Harness onResult={onResult} />);
    await flush();
    expect(lastFrame()).toContain('ready');
  });

  it('filters out an entry newer than --min-age', async () => {
    scanMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/fresh',
          project: '/root',
          kind: 'always-safe',
          ruleName: 'fresh',
          size: null,
          lastModified: null,
        },
      };
      yield { type: 'lastModified', path: '/root/fresh', mtimeMs: Date.now() };
      yield { type: 'done', totalBytes: 0 };
    });
    const onResult = vi.fn();
    const { lastFrame } = inkRender(
      <Harness onResult={onResult} options={{ minAgeMs: 86_400_000 }} />,
    );
    await flush();
    expect(onResult).toHaveBeenCalledWith({ kind: 'empty' });
    expect(lastFrame()).toContain('done');
  });

  it('keeps an entry older than --min-age and excludes one older than --max-age', async () => {
    const old = Date.now() - 2 * 86_400_000;
    scanMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/stale',
          project: '/root',
          kind: 'always-safe',
          ruleName: 'stale',
          size: null,
          lastModified: null,
        },
      };
      yield { type: 'lastModified', path: '/root/stale', mtimeMs: old };
      yield { type: 'done', totalBytes: 0 };
    });
    const onResult = vi.fn();
    const kept = inkRender(<Harness onResult={onResult} options={{ minAgeMs: 86_400_000 }} />);
    await flush();
    expect(onResult).not.toHaveBeenCalled();
    expect(kept.lastFrame()).toContain('ready');

    scanMock.mockReset();
    scanMock.mockImplementation(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/stale',
          project: '/root',
          kind: 'always-safe',
          ruleName: 'stale',
          size: null,
          lastModified: null,
        },
      };
      yield { type: 'lastModified', path: '/root/stale', mtimeMs: old };
      yield { type: 'done', totalBytes: 0 };
    });
    const onResult2 = vi.fn();
    const excluded = inkRender(<Harness onResult={onResult2} options={{ maxAgeMs: 86_400_000 }} />);
    await flush();
    expect(onResult2).toHaveBeenCalledWith({ kind: 'empty' });
    expect(excluded.lastFrame()).toContain('done');
  });
});
