import { afterEach, describe, expect, it, vi } from 'vitest';

// Two scenarios real filesystem fixtures can't provoke (skills/purgeit/
// genuinely exists and is readable in this repo checkout), so readdir/
// readFile are mocked directly: (1) neither the dist/cli.js nor the
// src/cli/*.ts candidate resolves the skills/ directory at all, and (2) the
// directory resolves but a specific skill file can't be read.
const readdirMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readdir: readdirMock, readFile: readFileMock };
});

const { runSkillsCommand } = await import('./skills.js');

function captureIO() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
  };
}

describe('runSkillsCommand fs failure paths', () => {
  afterEach(() => {
    readdirMock.mockReset();
    readFileMock.mockReset();
  });

  it('returns exit code 2 for "list" when the skills/ directory cannot be located', async () => {
    readdirMock.mockRejectedValue(new Error('ENOENT'));
    const io = captureIO();
    const code = await runSkillsCommand(['list'], io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/could not locate the skills\/ directory/);
  });

  it('returns exit code 2 for "get" when the skills/ directory cannot be located', async () => {
    readdirMock.mockRejectedValue(new Error('ENOENT'));
    const io = captureIO();
    const code = await runSkillsCommand(['get', 'core'], io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/could not locate the skills\/ directory/);
  });

  it('returns exit code 2 when the directory resolves but the skill file cannot be read', async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockRejectedValue(new Error('EACCES: permission denied'));
    const io = captureIO();
    const code = await runSkillsCommand(['get', 'core'], io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/failed to read skill 'core'/);
  });
});
