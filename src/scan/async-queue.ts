/**
 * Minimal async pull-based queue bridging concurrent producers (multiple
 * in-flight p-limit-scheduled tasks pushing at arbitrary times) into a
 * single ordered async generator for a consumer to `for await` over.
 */
export class AsyncQueue<T> {
  private readonly buffered: T[] = [];
  private readonly waiting: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const resolver = this.waiting.shift();
    if (resolver) {
      resolver({ value: item, done: false });
    } else {
      this.buffered.push(item);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolver of this.waiting.splice(0)) {
      resolver({ value: undefined as unknown as T, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      if (this.buffered.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: length > 0 was just checked
        yield this.buffered.shift()!;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiting.push(resolve);
      });
      if (result.done) return;
      yield result.value;
    }
  }
}
