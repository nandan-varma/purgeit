import { describe, expect, it, vi } from 'vitest';

describe('cli-main (bin entry, scaffold placeholder)', () => {
  it('writes a placeholder line to stdout', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await import('./cli-main.js');
    expect(write).toHaveBeenCalledWith('purgeit: scaffold placeholder\n');
    write.mockRestore();
  });
});
