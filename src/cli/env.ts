import { createInterface } from 'node:readline/promises';

import { defaultHistoryFile } from '../clean/history.js';

/** Everything the CLI touches outside its arguments, injectable so tests run in-process. */
export interface CliEnv {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  /** Raw stderr, no newline added — for a progress line that rewrites itself. */
  readonly errRaw: (text: string) => void;
  readonly cwd: string;
  /** Both stdin and stdout are terminals: prompts and the TUI are possible. */
  readonly interactive: boolean;
  readonly confirm: (question: string) => Promise<boolean>;
  readonly signal?: AbortSignal;
  /** Where deletions are logged; undefined disables history. */
  readonly historyFile: string | undefined;
  readonly home?: string;
  /** Where the user-level config lives; defaults to the platform's config directory. */
  readonly userConfigDir?: string;
}

/** Ctrl+C must reach a pending question: main aborts its controller, which rejects here. */
async function ask(question: string, signal?: AbortSignal): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `, { signal })).trim());
  } finally {
    rl.close();
  }
}

export function systemEnv(signal?: AbortSignal): CliEnv {
  return {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    errRaw: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    interactive: process.stdin.isTTY && process.stdout.isTTY,
    confirm: (question) => ask(question, signal),
    signal,
    historyFile: defaultHistoryFile(),
  };
}
