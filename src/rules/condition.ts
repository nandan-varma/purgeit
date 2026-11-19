import { access, open } from 'node:fs/promises';
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
 * One piece of proof: a sibling `file`, a sibling matching a `glob`, a sibling
 * file whose contents match a `grep` pattern, or a file `inside` the candidate
 * itself (a virtualenv is proved by the `pyvenv.cfg` it contains).
 */
export const ConditionSchema = z.union([
  z.strictObject({ file: entryName }),
  z.strictObject({ glob: entryName }),
  z.strictObject({ grep: z.strictObject({ file: entryName, pattern: regex }) }),
  z.strictObject({ inside: entryName }),
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

/** Proof files are small in practice; never drag a runaway multi-gigabyte one into memory. */
const GREP_LIMIT = 1 << 20;

/** True if the first `GREP_LIMIT` bytes of `dir/file` match `pattern`. */
async function grepFile(dir: string, file: string, pattern: string): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(join(dir, file), 'r');
    const buffer = Buffer.alloc(GREP_LIMIT);
    const { bytesRead } = await handle.read(buffer, 0, GREP_LIMIT, 0);
    return new RegExp(pattern, 'm').test(buffer.subarray(0, bytesRead).toString('utf8'));
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

async function holds(
  condition: Condition,
  dir: string,
  names: ReadonlySet<string>,
  candidate: string | undefined,
): Promise<boolean> {
  if ('inside' in condition) {
    return (
      candidate !== undefined &&
      (await access(join(candidate, condition.inside)).then(
        () => true,
        () => false,
      ))
    );
  }
  if ('file' in condition) return names.has(condition.file);
  if ('glob' in condition) {
    const matches = globMatcher(condition.glob);
    for (const name of names) if (matches(name)) return true;
    return false;
  }
  const { file, pattern } = condition.grep;
  if (!names.has(file)) return false;
  return grepFile(dir, file, pattern);
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
  candidate?: string,
): Promise<Condition | undefined> {
  for (const condition of toConditions(when)) {
    if (await holds(condition, dir, names, candidate)) return condition;
  }
  return undefined;
}
