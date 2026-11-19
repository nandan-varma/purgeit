import guide from '../../../skills/purgeit/guide.md';
import type { CliEnv } from '../env.js';

/** Prints the agent guide for the installed version. */
export function runSkill(env: CliEnv): number {
  env.out(guide.trimEnd());
  return 0;
}
