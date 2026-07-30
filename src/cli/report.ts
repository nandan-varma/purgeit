/**
 * Shared confirm -> stream delete events -> tally control flow, used by
 * both the local (headless.ts) and cloud (headless-cloud.ts) non-interactive
 * paths. This duplication existed once in headless.ts before the cloud path
 * existed; a second real caller is what justifies extracting it now — see
 * DeleteEvent (scan/deleter.ts, keyed by `path`) and CloudDeleteEvent
 * (providers/types.ts, keyed by `id`), which this normalizes to a common
 * `key` field rather than forcing the two domain types themselves together.
 */

export interface ReportIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly confirm: (question: string) => Promise<boolean>;
}

/** Asks a yes/no question on the real terminal. The default `confirm` for both headless paths. */
export async function defaultConfirm(question: string): Promise<boolean> {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export type NormalizedDeleteEvent =
  | { readonly type: 'deleting'; readonly key: string }
  | { readonly type: 'deleted'; readonly key: string; readonly dryRun: boolean }
  | { readonly type: 'error'; readonly key: string; readonly message: string }
  | { readonly type: 'done'; readonly deleted: number; readonly failed: number };

/**
 * Confirms (unless `yes`) using the caller-supplied question text, then
 * drives `runDelete()` — a thunk, not an already-started generator, so
 * nothing is deleted if the user declines — printing progress and a final
 * tally. Returns the process exit code (1 if any deletion failed).
 */
export async function confirmAndDelete(
  io: ReportIO,
  opts: { readonly confirmQuestion: string; readonly yes: boolean },
  runDelete: () => AsyncGenerator<NormalizedDeleteEvent>,
): Promise<number> {
  if (!opts.yes) {
    const proceed = await io.confirm(opts.confirmQuestion);
    if (!proceed) {
      io.stdout('Aborted.');
      return 0;
    }
  }

  let deletedCount = 0;
  let failedCount = 0;
  for await (const event of runDelete()) {
    if (event.type === 'deleted') {
      io.stdout(`${event.dryRun ? '(dry-run) ' : ''}deleted: ${event.key}`);
    } else if (event.type === 'error') {
      io.stderr(`error: ${event.key}: ${event.message}`);
    } else if (event.type === 'done') {
      deletedCount = event.deleted;
      failedCount = event.failed;
    }
  }
  io.stdout(`${deletedCount} deleted, ${failedCount} failed`);
  return failedCount > 0 ? 1 : 0;
}
