import { render } from 'ink';
import type { CliEnv } from '../cli/env.js';
import type { ResolvedScan } from '../cli/options.js';
import { formatSize } from '../units.js';
import { App, type TuiExit } from './App.js';

/** Runs the interactive UI to completion; returns the CLI exit code. */
export async function runTui(resolved: ResolvedScan, env: CliEnv): Promise<number> {
  const instance = render(
    <App
      roots={resolved.roots}
      rules={resolved.rules}
      scanOptions={resolved.options}
      idleFor={resolved.minAge}
      historyFile={env.historyFile}
      home={env.home}
    />,
    { alternateScreen: true },
  );
  const exit = (await instance.waitUntilExit()) as TuiExit | undefined;
  if (exit !== undefined && exit.count > 0) {
    env.out(
      `Deleted ${exit.count} artifact${exit.count === 1 ? '' : 's'}, freed ${formatSize(exit.bytes)}.`,
    );
  }
  return 0;
}
