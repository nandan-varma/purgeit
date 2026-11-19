import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { backdate, blob, buildTree } from '../../test/tree.js';
import { createRuleSet } from '../rules/rule-set.js';
import { App } from './App.js';

const BOTH = /(?=[\s\S]*node_modules)(?=[\s\S]*target)/;
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(read: () => string | undefined, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const frame = read() ?? '';
    if (pattern.test(frame)) return frame;
    await tick(30);
  }
  throw new Error(`never saw ${pattern}\n${read()}`);
}

function setup() {
  const root = buildTree({
    app: { 'package.json': '{}', node_modules: { 'a.js': blob(9000) } },
    rust: { 'Cargo.toml': '', target: { bin: blob(3000) } },
  });
  backdate(root);
  const rules = createRuleSet();
  const ui = render(
    <App
      roots={[root]}
      rules={rules}
      scanOptions={{ rules }}
      idleFor={0}
      historyFile={undefined}
      home={root}
    />,
  );
  return { root, ...ui };
}

describe('<App />', () => {
  it('lists artifacts as they are measured and shows the totals', async () => {
    const { lastFrame, unmount } = setup();
    const frame = await until(lastFrame, BOTH);
    expect(frame).toMatch(/purgeit/);
    expect(frame).toMatch(/node_modules/);
    expect(frame).toMatch(/reclaimable/);
    unmount();
  });

  it('selects with space, confirms with enter, deletes only on y', async () => {
    const { root, lastFrame, stdin, unmount } = setup();
    await until(lastFrame, BOTH);

    stdin.write('\r');
    await until(lastFrame, /Nothing selected/);

    stdin.write('a');
    await until(lastFrame, /2 selected/);
    stdin.write('\r');
    await until(lastFrame, /Delete 2 artifacts/);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(true);

    stdin.write('\u001b'); // esc cancels
    await until(lastFrame, /space select/);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(true);

    stdin.write('\r');
    await until(lastFrame, /Delete 2 artifacts/);
    stdin.write('y');
    await until(lastFrame, /Freed/);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(false);
    expect(existsSync(join(root, 'rust/target'))).toBe(false);

    stdin.write('b');
    await until(lastFrame, /Nothing to clean/);
    unmount();
  });

  it('filters the list as you type', async () => {
    const { lastFrame, stdin, unmount } = setup();
    await until(lastFrame, BOTH);
    stdin.write('/');
    stdin.write('tar');
    const frame = await until(lastFrame, /filter: tar/);
    expect(frame).not.toMatch(/node_modules/);
    stdin.write('\u001b');
    await until(lastFrame, BOTH);
    unmount();
  });
});
