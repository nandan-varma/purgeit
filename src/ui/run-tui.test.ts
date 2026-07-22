import { describe, expect, it, vi } from 'vitest';
import type { ScanResult } from './result.js';

const loadConfigMock = vi.fn();
const renderMock = vi.fn();

vi.mock('../config/resolve.js', () => ({ loadConfig: loadConfigMock }));
vi.mock('ink', () => ({ render: renderMock }));

describe('runTui', () => {
  it('returns exit code 1 when the scan is empty', async () => {
    loadConfigMock.mockResolvedValue({ config: undefined, filepath: undefined });
    renderMock.mockImplementation((element: React.ReactElement) => {
      const onResult = (element.props as { onResult?: (result: ScanResult | null) => void })
        .onResult;
      onResult?.({ kind: 'empty' });
      return { unmount: vi.fn(), waitUntilExit: () => Promise.resolve() };
    });
    const { runTui } = await import('./run-tui.js');
    const code = await runTui({ root: '/root', scanOpts: { mode: 'flat' } });
    expect(code).toBe(1);
  });

  it('returns exit code 1 when deletion has failures', async () => {
    loadConfigMock.mockResolvedValue({ config: undefined, filepath: undefined });
    renderMock.mockImplementation((element: React.ReactElement) => {
      const onResult = (element.props as { onResult?: (result: ScanResult | null) => void })
        .onResult;
      onResult?.({ kind: 'delete', deleted: 1, failed: 2 });
      return { unmount: vi.fn(), waitUntilExit: () => Promise.resolve() };
    });
    const { runTui } = await import('./run-tui.js');
    const code = await runTui({ root: '/root', scanOpts: { mode: 'flat' } });
    expect(code).toBe(1);
  });

  it('returns exit code 0 when the user quits', async () => {
    loadConfigMock.mockResolvedValue({ config: undefined, filepath: undefined });
    renderMock.mockImplementation((element: React.ReactElement) => {
      const onResult = (element.props as { onResult?: (result: ScanResult | null) => void })
        .onResult;
      onResult?.(null);
      return { unmount: vi.fn(), waitUntilExit: () => Promise.resolve() };
    });
    const { runTui } = await import('./run-tui.js');
    const code = await runTui({ root: '/root', scanOpts: { mode: 'flat' } });
    expect(code).toBe(0);
  });

  it('throws a config error when loadConfig fails', async () => {
    loadConfigMock.mockRejectedValue(new Error('bad config'));
    const { runTui } = await import('./run-tui.js');
    await expect(runTui({ root: '/root', scanOpts: { mode: 'flat' } })).rejects.toThrow(
      /config error.*bad config/,
    );
  });
});
