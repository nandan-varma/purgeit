import { open, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { describeCondition, findProof } from './condition.js';
import type { MarkerRule, MatchRule, NamedRule, RuleSet } from './rule-set.js';

/** A directory a rule claims, with the proof that satisfied it. */
export interface Hit {
  readonly rule: MatchRule;
  /** What proved a gated rule, e.g. "package.json"; undefined for safe and tagged rules. */
  readonly evidence: string | undefined;
}

/** Does a gated or safe rule claim the child of `dir` that carries its name? */
export async function matchNamed(
  rule: NamedRule,
  dir: string,
  names: ReadonlySet<string>,
): Promise<Hit | undefined> {
  if (rule.kind === 'safe') return { rule, evidence: undefined };
  const proof = await findProof(rule.when, dir, names);
  return proof === undefined ? undefined : { rule, evidence: describeCondition(proof) };
}

/** True if `dir/file` begins with the marker's signature. Unreadable means untagged. */
async function hasSignature(dir: string, marker: MarkerRule): Promise<boolean> {
  const expected = Buffer.from(marker.signature);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(join(dir, marker.file), 'r');
    const buffer = Buffer.alloc(expected.length);
    const { bytesRead } = await handle.read(buffer, 0, expected.length, 0);
    return bytesRead === expected.length && buffer.equals(expected);
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

/** Is `dir` (whose listing is `names`) tagged as a cache by a marker rule? */
export async function matchMarker(
  rules: RuleSet,
  dir: string,
  names: ReadonlySet<string>,
): Promise<Hit | undefined> {
  for (const rule of rules.markers) {
    if (names.has(rule.file) && (await hasSignature(dir, rule))) {
      return { rule, evidence: rule.file };
    }
  }
  return undefined;
}

const listing = async (dir: string): Promise<ReadonlySet<string>> => new Set(await readdir(dir));

/**
 * Re-derives, from the filesystem as it is now, whether `path` is claimed by a
 * rule — the same decision the scanner makes, used to re-verify before deleting.
 */
export async function matchPath(rules: RuleSet, path: string): Promise<Hit | undefined> {
  const name = basename(path);
  if (rules.ignore.has(name)) return undefined;
  const named = rules.named.get(name);
  if (named !== undefined) {
    const parent = dirname(path);
    return matchNamed(named, parent, await listing(parent));
  }
  return matchMarker(rules, path, await listing(path));
}
