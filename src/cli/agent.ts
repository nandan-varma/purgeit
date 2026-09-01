import { formatErrorMessage } from '../format.js';
import { AGENT_INSTRUCTIONS, AGENT_SCHEMA } from './guide.js';

export interface AgentIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export async function runAgentCommand(argv: string[], io: AgentIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const subcommand = argv[0];

  try {
    if (subcommand === 'instructions') {
      stdout(AGENT_INSTRUCTIONS);
      return 0;
    }
    if (subcommand === 'schema') {
      stdout(JSON.stringify(AGENT_SCHEMA, null, 2));
      return 0;
    }
    throw new Error('usage: purgeit agent <instructions|schema>');
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
}
