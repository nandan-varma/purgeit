import { describe, expect, it, vi } from 'vitest';

const rmMock = vi.fn();

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, rm: rmMock };
});

const { deleteEntries } = await import('./deleter.js');

describe('deleteEntries non-Error throw', () => {
  it('wraps a non-Error thrown by rm in an Error', async () => {
    rmMock.mockRejectedValue('threw a string');
    const events = [];
    for await (const event of deleteEntries(['/does/not/matter'])) {
      events.push(event);
    }
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.type === 'error' && errorEvent.message).toBe('threw a string');
    expect(events.find((e) => e.type === 'done')).toEqual({ type: 'done', deleted: 0, failed: 1 });
  });
});
