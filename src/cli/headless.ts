import { basename, resolve } from 'node:path';
import { loadConfig } from '../config/resolve.js';
import { deleteEntries } from '../delete/deleter.js';
import { formatBytes, formatErrorMessage, parseDuration, parseSizeString } from '../format.js';
import { applyCliFilters, defaultRuleSet, mergeRuleSets } from '../rules/merge.js';
import { createExcludeMatcher } from '../scan/exclude.js';
import type { ScanEntry } from '../scan/scanner.js';
import { scan } from '../scan/scanner.js';
import type { ParsedCli } from './args.js';
import { confirmAndDelete, defaultConfirm } from './report.js';

export interface HeadlessIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  cwd?: string;
  signal?: AbortSignal | undefined;
  /** Asks a yes/no question for the delete confirmation prompt. Defaults to reading real stdin. */
  confirm?: (question: string) => Promise<boolean>;
}

function sortEntries(
  entries: ScanEntry[],
  sortKey: ParsedCli['sort'],
  ascending: boolean,
  sizeOf: (path: string) => number,
): ScanEntry[] {
  const dir = ascending ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (sortKey === 'size') return dir * (sizeOf(a.path) - sizeOf(b.path));
    if (sortKey === 'name') return dir * basename(a.path).localeCompare(basename(b.path));
    return dir * a.path.localeCompare(b.path);
  });
}

/**
 * Runs purgeit's non-interactive path: resolves config, scans, applies
 * exclude/min-size/targets/no-gated filters, then reports (--json or a
 * text preview) or deletes (--delete, confirming unless --yes). Returns the
 * process exit code instead of calling `process.exit`, so it's directly
 * testable — mirrors platex's `runCli(argv, io)` pattern.
 */
export async function runHeadless(parsed: ParsedCli, io: HeadlessIO = {}): Promise<number> {
  const cwd = io.cwd ?? process.cwd();
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const confirm = io.confirm ?? defaultConfirm;
  const root = resolve(cwd, parsed.directory);

  let minSizeBytes = 0;
  if (parsed.minSize !== undefined) {
    try {
      minSizeBytes = parseSizeString(parsed.minSize);
    } catch (err) {
      stderr(`purgeit: ${formatErrorMessage(err)}`);
      return 2;
    }
  }

  let minAgeMs: number | undefined;
  let maxAgeMs: number | undefined;
  try {
    if (parsed.minAge !== undefined) minAgeMs = parseDuration(parsed.minAge);
    if (parsed.maxAge !== undefined) maxAgeMs = parseDuration(parsed.maxAge);
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

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

  const found: ScanEntry[] = [];
  const sizes = new Map<string, number>();
  const lastModifieds = new Map<string, number>();
  const warnings: string[] = [];

  try {
    for await (const event of scan(root, ruleSet, {
      signal: io.signal,
      mode: parsed.full ? 'flat' : 'projects',
      targetProject: parsed.project,
      concurrency: parsed.concurrency,
      maxDepth: parsed.depth,
    })) {
      if (event.type === 'found') {
        if (!isExcluded(event.entry.path)) found.push(event.entry);
      } else if (event.type === 'size') {
        sizes.set(event.path, event.bytes);
      } else if (event.type === 'lastModified') {
        lastModifieds.set(event.path, event.mtimeMs);
      } else if (event.type === 'warning') {
        warnings.push(`${event.warning.file}: ${event.warning.message}`);
      }
    }
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

  for (const warning of warnings) {
    stderr(`warning: ${warning}`);
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
  const filtered = sortEntries(
    found.filter((e) => sizeOf(e.path) >= minSizeBytes && passesAge(e.path)),
    parsed.sort,
    parsed.ascending,
    sizeOf,
  );
  const totalBytes = filtered.reduce((sum, e) => sum + sizeOf(e.path), 0);

  if (parsed.json) {
    stdout(
      JSON.stringify(
        {
          root,
          totalBytes,
          entries: filtered.map((e) => ({
            path: e.path,
            project: e.project,
            kind: e.kind,
            ruleName: e.ruleName,
            size: sizeOf(e.path),
            lastModified: lastModifiedOf(e.path) ?? null,
          })),
          warnings,
        },
        null,
        2,
      ),
    );
    return filtered.length === 0 ? 1 : 0;
  }

  if (filtered.length === 0) {
    stdout('Nothing to clean.');
    return 1;
  }

  for (const entry of filtered) {
    stdout(`${formatBytes(sizeOf(entry.path)).padStart(9)}  ${entry.path}`);
  }
  stdout('');
  stdout(`${filtered.length} item(s), ${formatBytes(totalBytes)} total`);

  if (!parsed.delete) {
    stdout('Run with --delete to actually delete.');
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
        filtered.map((e) => e.path),
        { signal: io.signal, dryRun: parsed.dryRun, concurrency: parsed.concurrency },
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
