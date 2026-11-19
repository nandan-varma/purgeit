import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, parse, relative, resolve } from 'node:path';

import { errorMessage } from '../errors.js';
import { hasActivitySince } from '../fs/activity.js';
import { statEntry } from '../fs/io.js';
import { findProtection, PROTECTION_LABELS } from '../fs/protection.js';
import { matchPath } from '../rules/match.js';
import type { RuleSet } from '../rules/rule-set.js';
import { formatDuration } from '../units.js';

/** Why a path was left alone. Refusals are decisions, not failures. */
export type RefusalCode =
  | 'dangerous'
  | 'missing'
  | 'outside-roots'
  | 'no-longer-matches'
  | 'protected'
  | 'recently-active'
  | 'changed-since-scan'
  | 'unverifiable';

export interface Refusal {
  readonly code: RefusalCode;
  readonly message: string;
}

export interface GuardContext {
  readonly rules: RuleSet;
  /** Real paths of the scan roots every target must resolve strictly inside. */
  readonly realRoots: readonly string[];
  /** Refuse anything modified within this many ms of `now`. 0 disables. */
  readonly idleFor: number;
  readonly now: number;
  readonly home?: string;
}

export interface Candidate {
  readonly path: string;
  /** Refuse if anything inside was modified after this time (epoch ms) — the scan's `lastActive`. */
  readonly unchangedSince?: number;
}

const refuse = (code: RefusalCode, message: string): { refusal: Refusal } => ({
  refusal: { code, message },
});

/** Filesystem root, a drive root, or the home directory. */
function isDangerous(path: string, home: string): boolean {
  const resolved = resolve(path);
  return parse(resolved).root === resolved || resolved === resolve(home);
}

const isInside = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

/**
 * Everything that must still be true at the moment of deletion, re-derived
 * from the filesystem as it is now — a scan result or a plan file is only a
 * suggestion. Returns the first reason to refuse, or the verified real path to
 * delete: deleting that, rather than the original spelling, means an ancestor
 * swapped for a symlink after this check cannot redirect the delete.
 * Anything that cannot be verified is refused.
 */
export async function inspect(
  candidate: Candidate,
  context: GuardContext,
): Promise<{ readonly refusal: Refusal } | { readonly real: string }> {
  const path = resolve(candidate.path);
  if (isDangerous(path, context.home ?? homedir())) {
    return refuse('dangerous', 'refusing to delete a filesystem root or the home directory');
  }

  try {
    const stats = await stat(path).catch(() => undefined);
    if (stats === undefined) return refuse('missing', 'no longer exists');

    const real = await realpath(path);
    if (!context.realRoots.some((root) => isInside(root, real))) {
      return refuse('outside-roots', 'resolves outside the scanned roots');
    }
    const lstats = await statEntry(path);
    if (!lstats.isDirectory() || (await matchPath(context.rules, path)) === undefined) {
      return refuse('no-longer-matches', 'is no longer claimed by any rule');
    }
    // Matching `path` (not `real`) is sound: a symlinked target is refused above by
    // lstat, and a symlinked ancestor of `path` resolves to the same real parent,
    // so the listing `matchPath` reads is the directory `real` lives in.

    const protection = await findProtection(path);
    if (protection !== undefined) return refuse('protected', PROTECTION_LABELS[protection]);

    if (context.idleFor > 0) {
      const since = context.now - context.idleFor;
      if (await hasActivitySince(path, since)) {
        return refuse(
          'recently-active',
          `modified within the last ${formatDuration(context.idleFor)}`,
        );
      }
    }
    if (candidate.unchangedSince !== undefined) {
      if (await hasActivitySince(path, candidate.unchangedSince + 1)) {
        return refuse('changed-since-scan', 'was modified after it was scanned');
      }
    }
    return { real };
  } catch (error) {
    return refuse('unverifiable', `could not be verified: ${errorMessage(error)}`);
  }
}
