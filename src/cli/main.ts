#!/usr/bin/env node
import { systemEnv } from './env.js';
import { run } from './program.js';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());

try {
  process.exitCode = await run(process.argv.slice(2), systemEnv(controller.signal));
} catch (error) {
  process.stderr.write(
    `purgeit: unexpected error\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 70;
}
