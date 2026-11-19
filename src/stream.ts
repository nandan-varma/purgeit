/**
 * Turns a producer that pushes values from many concurrent tasks into an async
 * generator. The producer starts immediately and receives an AbortSignal that
 * fires when the consumer stops iterating or the optional outer `signal`
 * aborts; a producer failure surfaces to the consumer after queued values
 * drain, unless the outer signal aborted (a stopped stream just ends).
 */
export async function* stream<T>(
  produce: (emit: (value: T) => void, signal: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): AsyncGenerator<T, void, undefined> {
  const internal = new AbortController();
  const combined =
    signal === undefined ? internal.signal : AbortSignal.any([signal, internal.signal]);
  const queue: T[] = [];
  let head = 0;
  let finished = false;
  let failure: { error: unknown } | undefined;
  let wake: (() => void) | undefined;

  const notify = (): void => {
    wake?.();
    wake = undefined;
  };

  void produce((value) => {
    queue.push(value);
    notify();
  }, combined)
    .catch((error: unknown) => {
      failure = { error };
    })
    .finally(() => {
      finished = true;
      notify();
    });

  try {
    while (true) {
      if (head < queue.length) {
        yield queue[head++] as T;
        if (head > 1024) {
          queue.splice(0, head);
          head = 0;
        }
      } else if (finished) {
        break;
      } else {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    }
    if (failure !== undefined && !combined.aborted) throw failure.error;
  } finally {
    internal.abort();
  }
}
