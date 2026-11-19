// End-to-end check of the built CLI (dist/cli.mjs) against a real fixture tree.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'purgeit-smoke-')));
try {
  const app = join(root, 'app');
  for (const dir of ['node_modules/x', 'dist']) mkdirSync(join(app, dir), { recursive: true });
  writeFileSync(join(app, 'package.json'), '{}');
  writeFileSync(join(app, 'node_modules/x/index.js'), 'x'.repeat(4096));
  writeFileSync(join(app, 'dist/out.js'), 'x'.repeat(1024));
  const old = new Date(Date.now() - 30 * 86_400_000);
  for (const path of [
    app,
    join(app, 'node_modules'),
    join(app, 'node_modules/x'),
    join(app, 'node_modules/x/index.js'),
    join(app, 'dist'),
    join(app, 'dist/out.js'),
  ]) {
    utimesSync(path, old, old);
  }

  const cli = (...args) =>
    execFileSync(process.execPath, ['dist/cli.mjs', ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: root, USERPROFILE: root },
    });

  const report = JSON.parse(cli('scan', root, '--format', 'json'));
  assert.equal(report.entries.length, 2, 'scan finds node_modules and dist');

  cli('clean', root, '--dry-run');
  assert.ok(existsSync(join(app, 'node_modules')), 'dry run deletes nothing');

  cli('clean', root, '--yes');
  assert.ok(!existsSync(join(app, 'node_modules')), 'clean deletes node_modules');
  assert.ok(existsSync(join(app, 'package.json')), 'clean keeps sources');
  console.log('smoke test passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
