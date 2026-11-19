import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

import picomatch from 'picomatch';

import { isSkippable, listDir } from '../fs/io.js';
import { measure } from '../fs/measure.js';
import { findProtection, isGitIgnored, type ProtectionReason } from '../fs/protection.js';
import { type Hit, matchMarker, matchNamed } from '../rules/match.js';
import type { MatchRule, RuleSet } from '../rules/rule-set.js';
import { stream } from '../stream.js';
import { type ProjectRef, recognizeProject, resolveProject } from './project.js';
import { syncProvider } from './sync.js';

/** A directory a rule claimed, fully measured. */
export interface Entry {
  readonly path: string;
  /** The scan root it was found under. */
  readonly root: string;
  /** What it belongs to. */
  readonly project: ProjectRef;
  readonly rule: MatchRule;
  /** What proved a gated rule (e.g. "package.json"). */
  readonly evidence: string | undefined;
  readonly bytes: number;
  readonly files: number;
  /** Newest modification time (epoch ms) of anything inside. */
  readonly lastActive: number;
  /** Why it must not be deleted; undefined when it is deletable. */
  readonly protection: ProtectionReason | undefined;
  /** Whether git ignores it: `true` is evidence it is not authored; undefined outside a repository. */
  readonly gitIgnored: boolean | undefined;
  /** The cloud-sync provider whose folder it sits in, if any. */
  readonly synced: string | undefined;
}

export type DropReason = 'empty' | 'too-small' | 'too-recent' | 'active-project' | 'unreadable';

export interface ScanSummary {
  /** Directories a rule claimed, before filtering. */
  readonly found: number;
  /** Deletable entries reported. */
  readonly entries: number;
  readonly protected: number;
  readonly dropped: Readonly<Record<DropReason, number>>;
  /** Directories that could not be listed (permissions, vanished). */
  readonly unreadable: number;
  /** Total bytes of deletable entries. */
  readonly bytes: number;
  readonly durationMs: number;
}

export type ScanEvent =
  | { readonly type: 'found'; readonly path: string }
  | { readonly type: 'entry'; readonly entry: Entry }
  | { readonly type: 'dropped'; readonly path: string; readonly reason: DropReason }
  | { readonly type: 'done'; readonly summary: ScanSummary };

export interface ScanOptions {
  readonly rules: RuleSet;
  readonly signal?: AbortSignal;
  /** Never descend deeper than this many levels below a root. */
  readonly depth?: number;
  /** Globs, relative to each root, that are skipped entirely. A bare name matches at any depth. */
  readonly exclude?: readonly string[];
  /** Drop artifacts smaller than this many bytes. */
  readonly minBytes?: number;
  /** Drop artifacts modified within this many milliseconds. */
  readonly minAge?: number;
  /** Keep artifacts that contain no files at all. */
  readonly includeEmpty?: boolean;
  /** Drop artifacts of projects worked on within this many milliseconds (git's signal, else the artifact's own activity). */
  readonly dormantFor?: number;
  /** Overrides the home directory (whose Library, Trash and Applications are never entered). */
  readonly home?: string;
}

/** Directories directly under home that belong to the system, not to any project. */
export const HOME_SKIPPED: ReadonlySet<string> = new Set(['Library', '.Trash', 'Applications']);

/** Drops roots that sit inside another root, so nothing is found twice. */
export function normalizeRoots(roots: readonly string[]): string[] {
  const resolved = [...new Set(roots.map((root) => resolve(root)))].toSorted();
  return resolved.filter(
    (root, index) =>
      !resolved.slice(0, index).some((outer) => root === outer || root.startsWith(outer + sep)),
  );
}

type ProjectContext = () => Promise<ProjectRef>;

/** Resolves once, on first use: most directories never need their project read. */
function lazily(make: () => Promise<ProjectRef>): ProjectContext {
  let pending: Promise<ProjectRef> | undefined;
  return () => {
    pending ??= make();
    return pending;
  };
}

/** The project of an artifact that sits outside any project: its own parent folder. */
const standalone = (path: string): ProjectRef => ({
  root: dirname(path),
  kind: 'folder',
  group: dirname(path),
  touchedAt: undefined,
});

/**
 * Finds every directory under `roots` that a rule claims and streams it once
 * it has been measured: `found` the moment a rule claims a path, then either
 * `entry` or `dropped`, and `done` at the end. Symlinks are never followed,
 * and a directory claimed by a rule is never entered.
 */
export async function* scan(
  roots: readonly string[],
  options: ScanOptions,
): AsyncGenerator<ScanEvent, void, undefined> {
  yield* stream<ScanEvent>(async (emit, signal) => {
    const startedAt = Date.now();
    const { rules } = options;
    const home = resolve(options.home ?? homedir());
    const excluded =
      options.exclude === undefined || options.exclude.length === 0
        ? undefined
        : picomatch([...options.exclude], { dot: true, basename: true });

    const claimed = new Set<string>();
    const dropped: Record<DropReason, number> = {
      empty: 0,
      'too-small': 0,
      'too-recent': 0,
      'active-project': 0,
      unreadable: 0,
    };
    let found = 0;
    let entries = 0;
    let protectedCount = 0;
    let unreadable = 0;
    let bytes = 0;

    const isExcluded = (root: string, path: string): boolean => {
      if (excluded === undefined) return false;
      const rel = relative(root, path).split(sep).join('/');
      return excluded(rel) || excluded(`${rel}/`);
    };

    const drop = (path: string, reason: DropReason): void => {
      dropped[reason]++;
      emit({ type: 'dropped', path, reason });
    };

    async function settle(
      root: string,
      path: string,
      hit: Hit,
      project: ProjectContext | undefined,
    ): Promise<void> {
      if (claimed.has(path)) return;
      claimed.add(path);
      found++;
      emit({ type: 'found', path });

      let measured: Awaited<ReturnType<typeof measure>>;
      try {
        measured = await measure(path, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (!isSkippable(error)) throw error;
        return drop(path, 'unreadable');
      }
      if (measured.files === 0 && options.includeEmpty !== true) return drop(path, 'empty');
      if (options.minBytes !== undefined && measured.bytes < options.minBytes) {
        return drop(path, 'too-small');
      }
      if (options.minAge !== undefined && startedAt - measured.lastActive < options.minAge) {
        return drop(path, 'too-recent');
      }

      const ref = (await project?.()) ?? standalone(path);
      if (
        options.dormantFor !== undefined &&
        startedAt - (ref.touchedAt ?? measured.lastActive) < options.dormantFor
      ) {
        return drop(path, 'active-project');
      }
      const [protection, gitIgnored] = await Promise.all([
        findProtection(path),
        ref.kind === 'folder' ? undefined : isGitIgnored(path),
      ]);
      signal.throwIfAborted();
      if (protection === undefined) {
        entries++;
        bytes += measured.bytes;
      } else {
        protectedCount++;
      }
      emit({
        type: 'entry',
        entry: {
          path,
          root,
          project: ref,
          rule: hit.rule,
          evidence: hit.evidence,
          bytes: measured.bytes,
          files: measured.files,
          lastActive: measured.lastActive,
          protection,
          gitIgnored,
          synced: syncProvider(path, home),
        },
      });
    }

    async function visit(
      root: string,
      dir: string,
      depth: number,
      enclosing: ProjectContext | undefined,
    ): Promise<void> {
      signal.throwIfAborted();
      let children: Awaited<ReturnType<typeof listDir>>;
      try {
        children = await listDir(dir);
      } catch (error) {
        if (!isSkippable(error)) throw error;
        unreadable++;
        return;
      }
      const names = new Set(children.map((child) => child.name));
      const seed = recognizeProject(dir, children, enclosing !== undefined);
      const project = seed === undefined ? enclosing : lazily(() => resolveProject(seed));

      if (depth > 0) {
        const tagged = await matchMarker(rules, dir, names);
        if (tagged !== undefined) return settle(root, dir, tagged, project);
      }

      const tasks: Promise<void>[] = [];
      for (const child of children) {
        if (!child.isDirectory()) continue;
        const name = child.name;
        if (rules.ignore.has(name) || (dir === home && HOME_SKIPPED.has(name))) continue;
        const path = join(dir, name);
        if (isExcluded(root, path)) continue;

        const rule = rules.named.get(name);
        if (rule !== undefined) {
          tasks.push(
            matchNamed(rule, dir, names).then((hit) =>
              hit === undefined ? undefined : settle(root, path, hit, project),
            ),
          );
        } else if (options.depth === undefined || depth < options.depth) {
          tasks.push(visit(root, path, depth + 1, project));
        }
      }
      await Promise.all(tasks);
    }

    await Promise.all(normalizeRoots(roots).map((root) => visit(root, root, 0, undefined)));

    emit({
      type: 'done',
      summary: {
        found,
        entries,
        protected: protectedCount,
        dropped,
        unreadable,
        bytes,
        durationMs: Date.now() - startedAt,
      },
    });
  }, options.signal);
}

/** Deletable entries first, largest first; protected ones last. */
export const compareEntries = (a: Entry, b: Entry): number =>
  Number(a.protection !== undefined) - Number(b.protection !== undefined) || b.bytes - a.bytes;

export interface ScanResult {
  /** Largest first; protected entries last. */
  readonly entries: readonly Entry[];
  readonly summary: ScanSummary;
}

/** Runs a scan to completion. */
export async function scanAll(roots: readonly string[], options: ScanOptions): Promise<ScanResult> {
  const entries: Entry[] = [];
  let summary: ScanSummary | undefined;
  for await (const event of scan(roots, options)) {
    if (event.type === 'entry') entries.push(event.entry);
    else if (event.type === 'done') summary = event.summary;
  }
  if (summary === undefined) throw new Error('scan ended without a summary (aborted?)');
  entries.sort(compareEntries);
  return { entries, summary };
}
