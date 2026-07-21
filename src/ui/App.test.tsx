import { EventEmitter } from 'node:events';
import { render as inkRender } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedRuleSet } from '../types.js';
import { App } from './App.js';

// Feeds useScanner a canned sequence instead of a real filesystem scan:
// two resolved entries (node_modules larger than dist) plus one warning.
vi.mock('../scan/scanner.js', async () => {
  const actual = await vi.importActual<typeof import('../scan/scanner.js')>('../scan/scanner.js');
  return {
    ...actual,
    scan: vi.fn(async function* () {
      yield {
        type: 'found',
        entry: {
          path: '/root/a/node_modules',
          project: 'a',
          kind: 'always-safe',
          ruleName: 'node_modules',
          size: 1_000_000,
        },
      };
      yield {
        type: 'found',
        entry: {
          path: '/root/b/dist',
          project: 'b',
          kind: 'always-safe',
          ruleName: 'dist',
          size: 500,
        },
      };
      yield {
        type: 'warning',
        warning: { file: '/root/b/package.json', message: 'missing name field' },
      };
      yield { type: 'done', totalBytes: 1_000_500 };
    }),
  };
});

const emptyRuleSet: ResolvedRuleSet = {
  alwaysSafe: new Set(),
  gated: new Map(),
  pruneMeta: new Set(),
  skipDirs: new Set(),
  targets: new Map(),
};

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderApp() {
  const instance = render(<App root="/root" ruleSet={emptyRuleSet} scanOpts={{ mode: 'flat' }} />);
  return instance;
}

describe('App', () => {
  it('starts with nothing selected once scanning finishes', async () => {
    const { lastFrame } = renderApp();
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('[x]');
    expect(frame).toContain('[ ]');
  });

  it('does not reach the confirm dialog on enter with nothing selected', async () => {
    const { lastFrame, stdin } = renderApp();
    await flush();
    stdin.write('\r');
    await flush();
    expect(lastFrame() ?? '').not.toMatch(/Delete \d+ item/);
  });

  it('reaches the confirm dialog only after selecting via space then enter', async () => {
    const { lastFrame, stdin } = renderApp();
    await flush();
    stdin.write(' ');
    await flush();
    expect(lastFrame() ?? '').toContain('[x]');
    stdin.write('\r');
    await flush();
    expect(lastFrame() ?? '').toMatch(/Delete 1 item/);
  });

  it('surfaces validator warnings collected during the scan', async () => {
    const { lastFrame } = renderApp();
    await flush();
    expect(lastFrame() ?? '').toContain('missing name field');
  });

  it('reorders the visible rows when the sort key or direction changes', async () => {
    const { lastFrame, stdin } = renderApp();
    await flush();
    // Default: size descending — node_modules (bigger) before dist.
    const before = lastFrame() ?? '';
    expect(before.indexOf('node_modules')).toBeLessThan(before.indexOf('dist'));

    stdin.write('r'); // reverse -> ascending
    await flush();
    const after = lastFrame() ?? '';
    expect(after.indexOf('dist')).toBeLessThan(after.indexOf('node_modules'));
  });
});

describe('App quitting', () => {
  it('actually exits the process (waitUntilExit resolves) when q is pressed', async () => {
    // ink-testing-library's `render` doesn't expose `waitUntilExit`, so this
    // uses the real `ink.render` directly with minimal fake streams — the
    // most faithful regression test for the bug where `q` updated state but
    // never called Ink's `unmount()`, leaving the real CLI process hanging.
    class FakeStdin extends EventEmitter {
      isTTY = true;
      private data: string | null = null;
      write = (chunk: string) => {
        this.data = chunk;
        this.emit('readable');
      };
      setEncoding() {}
      setRawMode() {}
      resume() {}
      pause() {}
      ref() {}
      unref() {}
      read = () => {
        const d = this.data;
        this.data = null;
        return d;
      };
    }
    class FakeOutput extends EventEmitter {
      columns = 100;
      write = () => true;
    }

    const stdin = new FakeStdin();
    const stdout = new FakeOutput();
    const stderr = new FakeOutput();

    const instance = inkRender(
      <App root="/root" ruleSet={emptyRuleSet} scanOpts={{ mode: 'flat' }} />,
      // biome-ignore lint/suspicious/noExplicitAny: fake streams only need the subset of the Node stream API Ink actually touches
      { stdin: stdin as any, stdout: stdout as any, stderr: stderr as any, exitOnCtrlC: false },
    );

    await flush();
    stdin.write('q');

    const exited = await Promise.race([
      instance.waitUntilExit().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
    ]);
    expect(exited).toBe(true);
  });
});
