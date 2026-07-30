import { describe, expect, it, vi } from 'vitest';
import { runSkillsCommand } from './skills.js';

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

describe('runSkillsCommand', () => {
  it('lists all skills with their descriptions', async () => {
    const io = captureIO();
    const code = await runSkillsCommand(['list'], io);
    expect(code).toBe(0);
    expect(io.out.some((l) => l.startsWith('core'))).toBe(true);
    expect(io.out.some((l) => l.startsWith('cloud'))).toBe(true);
  });

  it('prints the core skill content', async () => {
    const io = captureIO();
    const code = await runSkillsCommand(['get', 'core'], io);
    expect(code).toBe(0);
    expect(io.out[0]).toContain('purgeit — core');
    expect(io.out[0]).toContain('Golden rule for agents');
  });

  it('prints the cloud skill content', async () => {
    const io = captureIO();
    const code = await runSkillsCommand(['get', 'cloud'], io);
    expect(code).toBe(0);
    expect(io.out[0]).toContain('cloud cleanup');
  });

  it('appends the reference content when --full is passed', async () => {
    const io = captureIO();
    const code = await runSkillsCommand(['get', 'core', '--full'], io);
    expect(code).toBe(0);
    expect(io.out[0]).toContain('purgeit — core');
    expect(io.out[0]).toContain('Full CLI flag reference');
    expect(io.out[0]).toContain('Full library API');
  });

  it('does not append reference content without --full', async () => {
    const io = captureIO();
    await runSkillsCommand(['get', 'core'], io);
    expect(io.out[0]).not.toContain('Full CLI flag reference');
  });

  it('rejects an unknown skill name', async () => {
    const io = captureIO();
    const code = await runSkillsCommand(['get', 'bogus'], io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/unknown skill 'bogus'/);
  });

  it('rejects "get" with no skill name', async () => {
    const io = captureIO();
    const code = await runSkillsCommand(['get'], io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/needs a skill name/);
  });

  it('rejects a missing subcommand', async () => {
    const io = captureIO();
    const code = await runSkillsCommand([], io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/missing skills subcommand/);
  });

  it('rejects an unknown subcommand', async () => {
    const io = captureIO();
    const code = await runSkillsCommand(['bogus'], io);
    expect(code).toBe(2);
    expect(io.err[0]).toMatch(/unknown skills subcommand 'bogus'/);
  });

  it('uses process.stdout/stderr when io is not provided', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const listCode = await runSkillsCommand(['list']);
      expect(listCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalled();

      const badCode = await runSkillsCommand(['bogus']);
      expect(badCode).toBe(2);
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
