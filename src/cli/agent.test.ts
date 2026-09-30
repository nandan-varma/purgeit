import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAgentCommand } from './agent.js';
import { AGENT_INSTRUCTIONS, AGENT_SCHEMA } from './guide.js';

describe('purgeit agent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the operating guide and the JSON schema to stdout by default', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(await runAgentCommand(['instructions'])).toBe(0);
    expect(await runAgentCommand(['schema'])).toBe(0);
    expect(write.mock.calls.map(([text]) => text)).toEqual([
      `${AGENT_INSTRUCTIONS}\n`,
      `${JSON.stringify(AGENT_SCHEMA, null, 2)}\n`,
    ]);
  });

  it('rejects an unknown subcommand on stderr with exit code 2', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(await runAgentCommand(['bogus'])).toBe(2);
    expect(write).toHaveBeenCalledWith('purgeit: usage: purgeit agent <instructions|schema>\n');
  });
});
