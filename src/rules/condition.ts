import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import picomatch from 'picomatch';
import { z } from 'zod';

import { toConditions } from './catalog/describe.js';

/** A bare entry name — never a path, so it can be proven against a directory listing alone. */
const entryName = z
  .string()
  .min(1)
  .refine((value) => !/[\\/]/.test(value), 'must be a plain name, not a path');

const regex = z.string().refine((value) => {
  try {
    return RegExp(value, 'm') instanceof RegExp;
  } catch {
    return false;
  }
}, 'must be a valid regular expression');

/**
 * One piece of proof, evaluated against the directory that holds a candidate:
 * a sibling `file`, a sibling matching a `glob`, or a sibling file whose
 * contents match a `grep` pattern.
 */
export const ConditionSchema = z.union([
  z.strictObject({ file: entryName }),
  z.strictObject({ glob: entryName }),
  z.strictObject({ grep: z.strictObject({ file: entryName, pattern: regex }) }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** One condition, or a list of which any one suffices. */
export const WhenSchema = z.union([ConditionSchema, z.array(ConditionSchema).min(1)]);
export type When = z.infer<typeof WhenSchema>;

const matchers = new Map<string, (name: string) => boolean>();

function globMatcher(glob: string): (name: string) => boolean {
  let matcher = matchers.get(glob);
  if (matcher === undefined) {
    matcher = picomatch(glob, { dot: true });
    matchers.set(glob, matcher);
  }
  return matcher;
}

async function holds(
  condition: Condition,
  dir: string,
  names: ReadonlySet<string>,
): Promise<boolean> {
  if ('file' in condition) return names.has(condition.file);
  if ('glob' in condition) {
    const matches = globMatcher(condition.glob);
    for (const name of names) if (matches(name)) return true;
    return false;
  }
  const { file, pattern } = condition.grep;
  if (!names.has(file)) return false;
  try {
    return new RegExp(pattern, 'm').test(await readFile(join(dir, file), 'utf8'));
  } catch {
    // A condition is proof: a file that cannot be read proves nothing.
    return false;
  }
}

/**
 * Returns the first condition of `when` that holds for the directory `dir`
 * whose listing is `names`, or undefined if none does. File and glob
 * conditions are answered from the listing alone; only `grep` reads a file.
 */
export async function findProof(
  when: When | readonly Condition[],
  dir: string,
  names: ReadonlySet<string>,
): Promise<Condition | undefined> {
  for (const condition of toConditions(when)) {
    if (await holds(condition, dir, names)) return condition;
  }
  return undefined;
}
