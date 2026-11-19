import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { z } from 'zod';

/** A bare entry name — never a path, so it can be proven against a directory listing alone. */
const entryName = z
  .string()
  .min(1)
  .refine((value) => !/[\\/]/.test(value), 'must be a plain name, not a path');

const regex = z.string().refine((value) => {
  try {
    new RegExp(value, 'm');
    return true;
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

export function describeCondition(condition: Condition): string {
  if ('file' in condition) return condition.file;
  if ('glob' in condition) return condition.glob;
  return `${condition.grep.file} matching /${condition.grep.pattern}/`;
}

/** A `when` as prose: "Podfile or *.xcodeproj". */
export function describeWhen(when: When | readonly Condition[]): string {
  return toList(when).map(describeCondition).join(' or ');
}

function toList(when: When | readonly Condition[]): readonly Condition[] {
  return Array.isArray(when) ? when : [when as Condition];
}

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
  for (const condition of toList(when)) {
    if (await holds(condition, dir, names)) return condition;
  }
  return undefined;
}
