import { describe, expect, it } from 'vitest';

import { stream } from './stream.js';

const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const value of source) out.push(value);
  return out;
};

describe('stream', () => {
  it('yields values from concurrent producers and ends when they finish', async () => {
    const values = await collect(
      stream<number>(async (emit) => {
        await Promise.all(
          [1, 2, 3].map(async (n) => {
            await new Promise((resolve) => setTimeout(resolve, 10 - n));
            emit(n);
          }),
        );
      }),
    );
    expect(values.toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('delivers queued values before surfacing a failure', async () => {
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const value of stream<number>(async (emit) => {
          emit(1);
          throw new Error('boom');
        }))
          seen.push(value);
      })(),
    ).rejects.toThrow('boom');
    expect(seen).toEqual([1]);
  });

  it('ends quietly when the outer signal aborts', async () => {
    const controller = new AbortController();
    const values = await collect(
      stream<number>(async (emit, signal) => {
        emit(1);
        controller.abort();
        signal.throwIfAborted();
      }, controller.signal),
    );
    expect(values).toEqual([1]);
  });

  it('aborts the producer when the consumer stops early', async () => {
    let aborted = false;
    for await (const _ of stream<number>(async (emit, signal) => {
      emit(1);
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => {
          aborted = true;
          resolve();
        }),
      );
    }))
      break;
    expect(aborted).toBe(true);
  });

  it('handles long queues', async () => {
    const values = await collect(
      stream<number>(async (emit) => {
        for (let i = 0; i < 3000; i++) emit(i);
      }),
    );
    expect(values).toHaveLength(3000);
    expect(values[2999]).toBe(2999);
  });
});
