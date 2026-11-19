#!/usr/bin/env node
import { errorCode } from '../errors.js';
import { systemEnv } from './env.js';
import { run } from './program.js';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort());

// `purgeit scan | head` closes our stdout early: stop working and exit quietly.
let readerClosed = false;
process.stdout.on('error', (error) => {
  if (errorCode(error) !== 'EPIPE') throw error;
  readerClosed = true;
  controller.abort();
});

try {
  const code = await run(process.argv.slice(2), systemEnv(controller.signal));
  process.exitCode = readerClosed ? 0 : code;
} catch (error) {
  process.stderr.write(
    `purgeit: unexpected error\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 70;
}
