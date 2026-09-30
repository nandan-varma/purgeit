import { homedir } from 'node:os';
import { basename, relative, resolve, sep } from 'node:path';
import pLimit from 'p-limit';
import { loadConfig } from '../config/resolve.js';
import { DEFAULT_IDLE_MS, deleteEntries } from '../delete/deleter.js';
import {
  formatBytes,
  formatDuration,
  formatErrorMessage,
  parseDuration,
  parseSizeString,
} from '../format.js';
import { applyCliFilters, defaultRuleSet, mergeRuleSets } from '../rules/merge.js';
import { checkActivity } from '../scan/activity.js';
import { discoverRoots } from '../scan/discover.js';
import { createExcludeMatcher, createPathMatcher } from '../scan/exclude.js';
import { PROTECTION_DESCRIPTIONS, type ProtectionReason } from '../scan/protection.js';
import type { ScanEntry } from '../scan/scanner.js';
import { scan } from '../scan/scanner.js';
import type { ParsedCli } from './args.js';
import { confirmAndDelete, defaultConfirm } from './report.js';

const SAFETY_LABELS: Readonly<Record<ScanEntry['kind'], string>> = {
  'always-safe': 'safe',
  gated: 'gated',
  marker: 'tagged',
};

/**
 * Folders synced by iCloud Drive or a File Provider app (Dropbox, Google
 * Drive, OneDrive, ...): deleting an artifact there also deletes it from the
 * cloud copy and every other synced device, so entries are flagged.
 */
export function isCloudSynced(path: string, home = homedir()): boolean {
  return [
    resolve(home, 'Library', 'CloudStorage'),
    resolve(home, 'Library', 'Mobile Documents'),
  ].some((dir) => path === dir || path.startsWith(`${dir}${sep}`));
}

/** `~/…` for paths under the home directory, so multi-root output stays readable. */
export function tildify(path: string, home = homedir()): string {
  return path === home || path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}

export interface HeadlessIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  cwd?: string | undefined;
  signal?: AbortSignal | undefined;
  /** Asks a yes/no question for the delete confirmation prompt. Defaults to reading real stdin. */
  confirm?: (question: string) => Promise<boolean>;
}

/** A scan match together with the root it was found under. */
interface Found {
  readonly root: string;
  readonly entry: ScanEntry;
}

/** Everything one root's scan produced. */
interface RootScan {
  readonly found: Found[];
  readonly protectedMatches: {
    readonly root: string;
    readonly entry: ScanEntry;
    readonly reason: ProtectionReason;
  }[];
  readonly warnings: string[];
}

function sortEntries(
  entries: Found[],
  sortKey: ParsedCli['sort'],
  ascending: boolean,
  sizeOf: (path: string) => number,
): Found[] {
  const dir = ascending ? 1 : -1;
  return [...entries].sort(({ entry: a }, { entry: b }) => {
    if (sortKey === 'size') return dir * (sizeOf(a.path) - sizeOf(b.path));
    if (sortKey === 'name') return dir * basename(a.path).localeCompare(basename(b.path));
    return dir * a.path.localeCompare(b.path);
  });
}

/** The explicit roots (or the cwd when none are given and not discovering), then discovered ones, deduplicated. */
async function resolveRoots(parsed: ParsedCli, cwd: string): Promise<string[]> {
  const roots = (parsed.directories ?? [parsed.directory]).map((dir) => resolve(cwd, dir));
  if (roots.length === 0 && !parsed.discover) roots.push(resolve(cwd));
  if (parsed.discover) roots.push(...(await discoverRoots(defaultRuleSet())));
  return [...new Set(roots)];
}

/**
 * Runs purgeit's non-interactive path: resolves config, scans every root,
 * applies exclude/include/min-size/age/targets/no-gated filters, then reports
 * (JSON or a text preview) or deletes (--delete, confirming unless --yes).
 * Returns the process exit code instead of calling `process.exit`, so it's
 * directly testable — mirrors platex's `runCli(argv, io)` pattern.
 */
export async function runHeadless(parsed: ParsedCli, io: HeadlessIO = {}): Promise<number> {
  const startedAt = performance.now();
  const cwd = io.cwd ?? process.cwd();
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const confirm = io.confirm ?? defaultConfirm;

  let minSizeBytes = 0;
  let minAgeMs: number | undefined;
  let maxAgeMs: number | undefined;
  try {
    if (parsed.minSize !== undefined) minSizeBytes = parseSizeString(parsed.minSize);
    if (parsed.minAge !== undefined) minAgeMs = parseDuration(parsed.minAge);
    if (parsed.maxAge !== undefined) maxAgeMs = parseDuration(parsed.maxAge);
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
  // Zero-byte artifacts free nothing, so they're hidden unless asked for.
  const sizeFloor = parsed.includeEmpty ? minSizeBytes : Math.max(minSizeBytes, 1);

  const roots = await resolveRoots(parsed, cwd);
  const sizes = new Map<string, number>();
  const lastModifieds = new Map<string, number>();
  const inScope = new Map<string, (path: string) => boolean>();

  async function scanRoot(root: string): Promise<RootScan | number> {
    let loaded: Awaited<ReturnType<typeof loadConfig>>;
    try {
      loaded = await loadConfig({
        cwd: root,
        configPath: parsed.configPath,
        noConfig: parsed.noConfig,
      });
    } catch (err) {
      stderr(`purgeit: ${formatErrorMessage(err)}`);
      return 2;
    }
    const ruleSet = applyCliFilters(
      mergeRuleSets(defaultRuleSet(), loaded.config),
      parsed.noGated,
      parsed.targets,
    );
    const isExcluded = createExcludeMatcher(root, parsed.exclude);
    const isIncluded = createPathMatcher(root, parsed.include ?? []);
    inScope.set(
      root,
      (path) => !isExcluded(path) && ((parsed.include?.length ?? 0) === 0 || isIncluded(path)),
    );

    const result: RootScan = { found: [], protectedMatches: [], warnings: [] };
    try {
      for await (const event of scan(root, ruleSet, {
        signal: io.signal,
        mode: parsed.full ? 'flat' : 'projects',
        targetProject: parsed.project,
        concurrency: parsed.concurrency,
        maxDepth: parsed.depth,
      })) {
        if (event.type === 'found') {
          if (!isExcluded(event.entry.path)) result.found.push({ root, entry: event.entry });
        } else if (event.type === 'size') {
          sizes.set(event.path, event.bytes);
        } else if (event.type === 'lastModified') {
          lastModifieds.set(event.path, event.mtimeMs);
        } else if (event.type === 'protected') {
          if (!isExcluded(event.entry.path)) result.protectedMatches.push({ root, ...event });
        } else if (event.type === 'warning') {
          result.warnings.push(`${event.warning.file}: ${event.warning.message}`);
        }
      }
    } catch (err) {
      stderr(`purgeit: ${formatErrorMessage(err)}`);
      return 2;
    }
    return result;
  }

  // Roots are scanned one after another: each scan already runs `concurrency`
  // filesystem operations in parallel, and stacking scans would multiply that.
  const found: Found[] = [];
  const protectedMatches: RootScan['protectedMatches'] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const result = await scanRoot(root);
    if (typeof result === 'number') return result;
    // Overlapping roots (e.g. ~/dev and ~/dev/app) report an artifact once, under the first root.
    for (const match of result.found) {
      if (!seen.has(match.entry.path)) {
        seen.add(match.entry.path);
        found.push(match);
      }
    }
    protectedMatches.push(...result.protectedMatches);
    warnings.push(...result.warnings);
  }

  for (const warning of warnings) {
    stderr(`warning: ${warning}`);
  }
  const relativeTo = (root: string, path: string) => relative(root, path).split(sep).join('/');
  const protectedDiagnostics = protectedMatches.map(({ root, entry, reason }) => ({
    code: 'protected' as const,
    reason,
    path: entry.path,
    root,
    relativePath: relativeTo(root, entry.path),
    ruleName: entry.ruleName,
    message: `${relativeTo(root, entry.path)} matches '${entry.ruleName}' but ${PROTECTION_DESCRIPTIONS[reason]}; not offered for deletion`,
  }));
  for (const diagnostic of protectedDiagnostics) {
    stderr(`protected: ${diagnostic.message}`);
  }

  const sizeOf = (path: string) => sizes.get(path) ?? 0;
  const lastModifiedOf = (path: string) => lastModifieds.get(path);
  const passesAge = (path: string): boolean => {
    if (minAgeMs === undefined && maxAgeMs === undefined) return true;
    const lastModified = lastModifiedOf(path);
    if (lastModified === undefined) return false;
    const age = Date.now() - lastModified;
    if (minAgeMs !== undefined && age < minAgeMs) return false;
    if (maxAgeMs !== undefined && age > maxAgeMs) return false;
    return true;
  };
  const candidates = found.filter(
    ({ root, entry }) =>
      (inScope.get(root) as (path: string) => boolean)(entry.path) &&
      sizeOf(entry.path) >= sizeFloor &&
      passesAge(entry.path),
  );
  // A directory's own mtime misses changes deeper inside it, so --min-age also
  // requires that nothing below the artifact changed within the window.
  const idle =
    minAgeMs === undefined || minAgeMs === 0
      ? candidates
      : await (async () => {
          const limit = pLimit(parsed.concurrency);
          const verdicts = await Promise.all(
            candidates.map(({ entry }) => limit(() => checkActivity(entry.path, minAgeMs))),
          );
          return candidates.filter((_, i) => verdicts[i] === 'idle');
        })();
  const filtered = sortEntries(idle, parsed.sort, parsed.ascending, sizeOf);
  const totalBytes = filtered.reduce((sum, { entry }) => sum + sizeOf(entry.path), 0);

  const elapsedMs = performance.now() - startedAt;
  const entries = filtered.map(({ root, entry }) => ({
    path: entry.path,
    root,
    relativePath: relativeTo(root, entry.path),
    project: entry.project,
    kind: entry.kind,
    ruleName: entry.ruleName,
    size: sizeOf(entry.path),
    lastModified: lastModifiedOf(entry.path) ?? null,
    cloudSynced: isCloudSynced(entry.path),
  }));
  const primaryRoot = roots[0] ?? resolve(cwd);
  const report = {
    schemaVersion: 1,
    status: 'completed' as const,
    root: primaryRoot,
    roots,
    summary: { entryCount: entries.length, totalBytes, elapsedMs },
    // Legacy aliases remain while the former --json mode transitions to scan --format json.
    totalBytes,
    entries,
    diagnostics: [
      ...warnings.map((message) => ({ code: 'manifest-warning', message })),
      ...protectedDiagnostics,
    ],
    warnings,
  };
  const outputFormat = parsed.format ?? (parsed.json ? 'json' : 'table');
  if (outputFormat === 'json') {
    stdout(JSON.stringify(report, null, 2));
    return filtered.length === 0 && !parsed.emptyIsSuccess ? 1 : 0;
  }
  if (outputFormat === 'jsonl') {
    stdout(JSON.stringify({ schemaVersion: 1, type: 'scan.completed', report }));
    return filtered.length === 0 && !parsed.emptyIsSuccess ? 1 : 0;
  }

  const rootsLabel = roots.map((root) => tildify(root)).join(', ');
  if (filtered.length === 0) {
    stdout(parsed.emptyIsSuccess ? `No artifacts found under ${rootsLabel}.` : 'Nothing to clean.');
    return parsed.emptyIsSuccess ? 0 : 1;
  }

  // With several roots a root-relative path is ambiguous, so show ~-relative paths instead.
  const displayPath = ({ root, entry }: Found) =>
    roots.length > 1 ? tildify(entry.path) : relativeTo(root, entry.path);
  if (parsed.richOutput) {
    stdout(`Scan: ${rootsLabel}`);
    stdout(
      `${entries.length} artifact(s) · ${formatBytes(totalBytes)} listed · ${Math.round(elapsedMs)}ms`,
    );
    stdout('SIZE       AGE    PROJECT                 ARTIFACT        SAFETY  PATH');
  }
  for (const match of filtered) {
    const { entry } = match;
    if (!parsed.richOutput) {
      stdout(`${formatBytes(sizeOf(entry.path)).padStart(9)}  ${entry.path}`);
      continue;
    }
    const age = lastModifiedOf(entry.path);
    const path = `${isCloudSynced(entry.path) ? '[cloud] ' : ''}${displayPath(match)}`;
    stdout(
      `${formatBytes(sizeOf(entry.path)).padStart(9)}  ${(age === undefined ? '?' : formatDuration(Date.now() - age)).padStart(5)}  ${entry.project.padEnd(22)}  ${entry.ruleName.padEnd(14)}  ${SAFETY_LABELS[entry.kind].padEnd(6)}  ${path}`,
    );
  }
  stdout('');
  stdout(
    parsed.richOutput
      ? `${filtered.length} artifact(s), ${formatBytes(totalBytes)} listed`
      : `${filtered.length} item(s), ${formatBytes(totalBytes)} total`,
  );

  if (!parsed.delete) {
    stdout(
      parsed.richOutput
        ? 'Create an explicit plan before deleting: purgeit plan <directory> --include <relative-path>.'
        : 'Run with --delete to actually delete.',
    );
    return 0;
  }

  return confirmAndDelete(
    { stdout, stderr, confirm },
    {
      confirmQuestion: `Delete ${filtered.length} item(s), ${formatBytes(totalBytes)}?`,
      yes: parsed.yes,
    },
    async function* () {
      for await (const event of deleteEntries(
        filtered.map(({ entry }) => entry.path),
        {
          signal: io.signal,
          dryRun: parsed.dryRun,
          concurrency: parsed.concurrency,
          roots,
          idleForMs: minAgeMs ?? DEFAULT_IDLE_MS,
        },
      )) {
        if (event.type === 'deleting') yield { type: 'deleting', key: event.path };
        else if (event.type === 'deleted')
          yield { type: 'deleted', key: event.path, dryRun: event.dryRun };
        else if (event.type === 'error')
          yield { type: 'error', key: event.path, message: event.message };
        else yield { type: 'done', deleted: event.deleted, failed: event.failed };
      }
    },
  );
}
