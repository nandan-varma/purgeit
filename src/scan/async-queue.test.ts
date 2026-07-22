import { describe, expect, it } from 'vitest';
import { AsyncQueue } from './async-queue.js';

describe('AsyncQueue', () => {
  it('buffers pushed items and yields them in order to a consumer that starts late', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.close();

    const items: number[] = [];
    for await (const item of queue) items.push(item);
    expect(items).toEqual([1, 2]);
  });

  it('delivers items to a consumer already awaiting before they are pushed', async () => {
    const queue = new AsyncQueue<number>();
    const consumed: number[] = [];
    const consumer = (async () => {
      for await (const item of queue) consumed.push(item);
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.push(42);
    queue.close();
    await consumer;

    expect(consumed).toEqual([42]);
  });

  it('ignores a push after close instead of throwing', async () => {
    const queue = new AsyncQueue<number>();
    queue.close();
    queue.push(1); // no-op: must not resurrect a closed queue
    const items: number[] = [];
    for await (const item of queue) items.push(item);
    expect(items).toEqual([]);
  });

  it('ignores a second close instead of re-resolving pending waiters', async () => {
    const queue = new AsyncQueue<number>();
    const consumer = (async () => {
      const items: number[] = [];
      for await (const item of queue) items.push(item);
      return items;
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.close();
    queue.close(); // no-op: consumer's pending await was already resolved once
    expect(await consumer).toEqual([]);
  });
});
