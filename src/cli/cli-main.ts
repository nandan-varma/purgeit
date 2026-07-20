import { runCli } from './cli.js';

const controller = new AbortController();
process.once('SIGINT', () => {
  controller.abort();
  // Second Ctrl-C force-quits
  process.once('SIGINT', () => process.exit(130));
});

process.exitCode = await runCli(process.argv.slice(2), { signal: controller.signal });
