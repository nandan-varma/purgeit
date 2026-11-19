import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backdate, blob, buildTree } from '../../test/tree.js';
import type { CliEnv } from './env.js';
import { run } from './program.js';

interface Harness {
  readonly env: CliEnv;
  readonly out: string[];
  readonly err: string[];
  readonly asked: string[];
}

function harness(cwd: string, overrides: Partial<CliEnv> & { answer?: boolean } = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const { answer = true, ...rest } = overrides;
  const env: CliEnv = {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    cwd,
    interactive: false,
    confirm: async (question) => {
      asked.push(question);
      return answer;
    },
    historyFile: undefined,
    home: buildTree({}),
    ...rest,
  };
  return { env, out, err, asked };
}

function workspace() {
  const root = buildTree({
    app: { 'package.json': '{}', node_modules: { 'a.js': blob(4000) }, src: { 'i.ts': 'x' } },
    rust: { 'Cargo.toml': '', target: { bin: blob(9000) } },
    kept: { dist: { deploy: { 'p-keypair.json': '[]' } } },
  });
  backdate(root);
  return root;
}

const text = (lines: string[]) => lines.join('\n');

describe('scan', () => {
  it('prints a table and a summary', async () => {
    const root = workspace();
    const h = harness(root);
    expect(await run(['scan'], h.env)).toBe(0);
    const output = text(h.out);
    expect(output).toMatch(/SIZE\s+AGE\s+RULE\s+PATH/);
    expect(output).toMatch(/node_modules/);
    expect(output).toMatch(/target/);
    expect(output).toMatch(/protected: contains a \*-keypair\.json/);
    expect(output).toMatch(/2 artifacts · .* reclaimable · 1 protected/);
  });

  it('emits one JSON report that doubles as a plan', async () => {
    const root = workspace();
    const h = harness(root);
    expect(await run(['scan', '--format', 'json'], h.env)).toBe(0);
    const report = JSON.parse(text(h.out));
    expect(report).toMatchObject({
      version: 1,
      roots: [root],
      summary: { entries: 2, protected: 1 },
    });
    expect(report.entries.map((e: { rule: string }) => e.rule).sort()).toEqual([
      'dist',
      'node_modules',
      'target',
    ]);
    expect(report.entries[0]).toHaveProperty('lastActive');
  });

  it('streams ndjson', async () => {
    const h = harness(workspace());
    await run(['scan', '--format', 'ndjson'], h.env);
    const types = h.out.map((line) => JSON.parse(line).type);
    expect(types.filter((type) => type === 'entry')).toHaveLength(3);
    expect(types.at(-1)).toBe('done');
  });

  it('applies filters from flags', async () => {
    const root = workspace();
    const h = harness(root);
    await run(['scan', '--only', 'target', '--format', 'json'], h.env);
    expect(JSON.parse(text(h.out)).entries.map((e: { rule: string }) => e.rule)).toEqual([
      'target',
    ]);

    const big = harness(root);
    await run(['scan', '--min-size', '8KB', '--format', 'json'], big.env);
    expect(JSON.parse(text(big.out)).entries).toHaveLength(1);

    const fresh = harness(root);
    await run(['scan', '--min-age', '60d', '--format', 'json'], fresh.env);
    expect(JSON.parse(text(fresh.out)).entries).toHaveLength(0);

    const safe = harness(root);
    await run(['scan', '--safe-only', '--exclude', 'rust', '--format', 'json'], safe.env);
    expect(
      JSON.parse(text(safe.out))
        .entries.map((e: { rule: string }) => e.rule)
        .sort(),
    ).toEqual(['dist', 'node_modules']);
  });

  it('reads purgeit.config from the working directory unless told not to', async () => {
    const root = workspace();
    writeFileSync(join(root, 'purgeit.config.json'), '{"exclude":["app"]}');
    const withConfig = harness(root);
    await run(['scan', '--format', 'json'], withConfig.env);
    expect(JSON.parse(text(withConfig.out)).summary.entries).toBe(1);

    const without = harness(root);
    await run(['scan', '--no-config', '--format', 'json'], without.env);
    expect(JSON.parse(text(without.out)).summary.entries).toBe(2);

    const explicit = harness(root);
    expect(
      await run(['scan', '--config', 'purgeit.config.json', '--format', 'json'], explicit.env),
    ).toBe(0);
  });

  it('says what is wrong, with exit code 2', async () => {
    const root = workspace();
    for (const argv of [
      ['scan', join(root, 'nope')],
      ['scan', join(root, 'app/src/i.ts')],
      ['scan', '--min-age', 'soon'],
      ['scan', '--only', 'node_modulez'],
      ['scan', '--config', 'missing.json'],
      ['scan', '--depth', '0'],
      ['scan', '--format', 'xml'],
      ['frobnicate'],
    ]) {
      const h = harness(root);
      expect(await run(argv, h.env), argv.join(' ')).toBe(2);
      expect(h.err.length, argv.join(' ')).toBeGreaterThan(0);
    }
  });
});

describe('clean', () => {
  it('previews, deletes after confirmation, and records history', async () => {
    const root = workspace();
    const history = join(buildTree({}), 'history.jsonl');
    const h = harness(root, { interactive: true, historyFile: history });
    expect(await run(['clean', '--min-age', '0'], h.env)).toBe(0);
    expect(h.asked).toHaveLength(1);
    expect(h.asked[0]).toMatch(/^Delete 2 artifacts \(.*\)\?$/);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(false);
    expect(existsSync(join(root, 'rust/target'))).toBe(false);
    expect(existsSync(join(root, 'kept/dist'))).toBe(true);
    expect(existsSync(join(root, 'app/src/i.ts'))).toBe(true);
    expect(text(h.out)).toMatch(/Deleted 2 artifacts, freed/);
    expect(readFileSync(history, 'utf8').trim().split('\n')).toHaveLength(2);

    const log = harness(root, { historyFile: history });
    await run(['history', '--format', 'json'], log.env);
    expect(JSON.parse(text(log.out))).toHaveLength(2);
    const plain = harness(root, { historyFile: history });
    await run(['history', '-n', '1'], plain.env);
    expect(plain.out).toHaveLength(1);
  });

  it('leaves everything alone when the answer is no', async () => {
    const root = workspace();
    const h = harness(root, { interactive: true, answer: false });
    expect(await run(['clean', '--min-age', '0'], h.env)).toBe(1);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(true);
  });

  it('refuses to delete unattended without --yes', async () => {
    const root = workspace();
    const h = harness(root);
    expect(await run(['clean', '--min-age', '0'], h.env)).toBe(2);
    expect(text(h.err)).toMatch(/--yes/);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(true);
  });

  it('dry-run deletes nothing', async () => {
    const root = workspace();
    const h = harness(root);
    expect(await run(['clean', '--dry-run', '--min-age', '0'], h.env)).toBe(0);
    expect(text(h.out)).toMatch(/would delete/);
    expect(text(h.out)).toMatch(/Dry run: would delete 2 artifacts/);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(true);
  });

  it('protects anything touched within the default 7 days', async () => {
    const root = workspace();
    writeFileSync(join(root, 'app/node_modules/fresh.js'), 'x');
    const h = harness(root);
    expect(await run(['clean', '--yes'], h.env)).toBe(0);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(true);
    expect(existsSync(join(root, 'rust/target'))).toBe(false);
    expect(text(h.out)).toMatch(/Deleted 1 artifact, freed/);
  });

  it('prints machine output with --format json', async () => {
    const root = workspace();
    const h = harness(root);
    expect(await run(['clean', '--yes', '--min-age', '0', '--format', 'json'], h.env)).toBe(0);
    expect(JSON.parse(text(h.out))).toMatchObject({
      dryRun: false,
      deleted: [{}, {}],
      refused: [],
      failed: [],
    });
    expect(await run(['clean', '--format', 'json'], harness(root).env)).toBe(2);
  });

  it('says so when there is nothing to clean', async () => {
    const empty = harness(buildTree({ src: { 'a.ts': 'x' } }));
    expect(await run(['clean', '--yes'], empty.env)).toBe(0);
    expect(text(empty.out)).toBe('Nothing to clean.');
    const json = harness(buildTree({}));
    await run(['clean', '--yes', '--format', 'json'], json.env);
    expect(JSON.parse(text(json.out))).toEqual({ deleted: [], refused: [], failed: [] });
  });

  it('deletes exactly what a reviewed plan lists, re-verifying each entry', async () => {
    const root = workspace();
    const scan = harness(root);
    await run(['scan', '--format', 'json'], scan.env);
    const plan = JSON.parse(text(scan.out));
    plan.entries = plan.entries.filter((e: { rule: string }) => e.rule === 'target');
    plan.entries.push({ path: join(root, 'app/src'), bytes: 1 });
    const file = join(buildTree({}), 'plan.json');
    writeFileSync(file, JSON.stringify(plan));

    const h = harness(root);
    expect(await run(['clean', '--plan', file, '--yes', '--min-age', '0'], h.env)).toBe(1);
    expect(existsSync(join(root, 'rust/target'))).toBe(false);
    expect(existsSync(join(root, 'app/node_modules'))).toBe(true);
    expect(existsSync(join(root, 'app/src'))).toBe(true);
    expect(text(h.out)).toMatch(/skipped .*app\/src/);

    const bad = join(buildTree({}), 'bad.json');
    writeFileSync(bad, '{"version":2}');
    expect(await run(['clean', '--plan', bad, '--yes'], harness(root).env)).toBe(2);
    expect(
      await run(['clean', '--plan', join(root, 'none.json'), '--yes'], harness(root).env),
    ).toBe(2);
    expect(await run(['clean', '--plan', file, root, '--yes'], harness(root).env)).toBe(2);
  });
});

describe('rules, history, skill, help', () => {
  it('lists the rules in effect, including config', async () => {
    const root = buildTree({
      'purgeit.config.json': '{"safe":[".mycache"],"disable":["coverage"]}',
    });
    const h = harness(root);
    expect(await run(['rules'], h.env)).toBe(0);
    const output = text(h.out);
    expect(output).toMatch(/JavaScript \/ TypeScript/);
    expect(output).toMatch(/\.mycache/);
    expect(output).not.toMatch(/^\s+coverage\s/m);
    expect(output).toMatch(/only beside .*package\.json/);

    const rust = harness(root);
    await run(['rules', '--category', 'rust', '--format', 'json'], rust.env);
    expect(JSON.parse(text(rust.out)).map((r: { name: string }) => r.name)).toContain('target');
    expect(await run(['rules', '--category', 'cobol'], harness(root).env)).toBe(2);
  });

  it('shows an empty or disabled history', async () => {
    const root = buildTree({});
    const none = harness(root, { historyFile: join(root, 'h.jsonl') });
    await run(['history'], none.env);
    expect(text(none.out)).toMatch(/No deletions recorded/);
    const off = harness(root);
    await run(['history'], off.env);
    expect(text(off.out)).toMatch(/disabled/);
  });

  it('prints the agent guide, help and version', async () => {
    const h = harness(buildTree({}));
    expect(await run(['skill'], h.env)).toBe(0);
    expect(text(h.out)).toMatch(/purgeit/);
    const help = harness(buildTree({}));
    expect(await run(['--help'], help.env)).toBe(0);
    expect(text(help.out)).toMatch(/clean/);
    const version = harness(buildTree({}));
    expect(await run(['--version'], version.env)).toBe(0);
  });

  it('needs a terminal for the interactive UI', async () => {
    const h = harness(buildTree({}));
    expect(await run([], h.env)).toBe(2);
    expect(text(h.err)).toMatch(/needs a terminal/);
  });

  it('exits 130 when interrupted', async () => {
    const controller = new AbortController();
    controller.abort();
    const h = harness(workspace(), { signal: controller.signal });
    expect(await run(['scan'], h.env)).toBe(130);
  });
});
