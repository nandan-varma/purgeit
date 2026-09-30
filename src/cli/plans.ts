import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { DEFAULT_IDLE_MS, deleteEntries } from '../delete/deleter.js';
import { formatErrorMessage } from '../format.js';
import { MARKER_RULES } from '../rules/default-rules.js';
import { hasMarker } from '../rules/markers.js';
import { findProtection, PROTECTION_DESCRIPTIONS } from '../scan/protection.js';
import type { ScanEntry } from '../scan/scanner.js';
import { confirmAndDelete, defaultConfirm } from './report.js';

interface PlanEntry {
  readonly path: string;
  /** The scan root `relativePath` is relative to. Absent in v1 plans, whose single `root` applies. */
  readonly root?: string | undefined;
  readonly relativePath: string;
  readonly ruleName: string;
  /** Absent in plans written before marker rules existed; those entries are name-matched. */
  readonly kind?: ScanEntry['kind'] | undefined;
  readonly lastModified: number | null;
}

/** v2: one plan can span several scan roots; each entry names its own. */
interface CleanupPlanV2 {
  readonly schemaVersion: 2;
  readonly roots: readonly string[];
  readonly entries: readonly (PlanEntry & { readonly root: string })[];
}

/** v1 (single root) is still accepted by `apply`. */
interface CleanupPlanV1 {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly entries: readonly PlanEntry[];
}

type CleanupPlan = CleanupPlanV1 | CleanupPlanV2;

interface PlanIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  cwd?: string | undefined;
  confirm?: (question: string) => Promise<boolean>;
  signal?: AbortSignal | undefined;
  /** Recency guard window for deletions (see deleteEntries' idleForMs). Default DEFAULT_IDLE_MS. */
  idleForMs?: number | undefined;
}

function output(io: PlanIO): (text: string) => void {
  return io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
}

function errorOutput(io: PlanIO): (text: string) => void {
  return io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
}

export async function writePlan(
  report: {
    roots: readonly string[];
    entries: readonly (PlanEntry & { readonly root: string })[];
  },
  file: string,
  io: PlanIO = {},
): Promise<number> {
  const stdout = output(io);
  const path = resolve(io.cwd ?? process.cwd(), file);
  const plan: CleanupPlanV2 = { schemaVersion: 2, roots: report.roots, entries: report.entries };
  try {
    await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    stdout(`Wrote ${plan.entries.length} approved artifact(s) to ${path}.`);
    return 0;
  } catch (err) {
    errorOutput(io)(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
}

/** A marker entry must still carry its marker; any other entry must still have the rule's name. */
async function stillMatchesRule(path: string, entry: PlanEntry): Promise<boolean> {
  if (entry.kind !== 'marker') return basename(path) === entry.ruleName;
  const spec = MARKER_RULES.get(entry.ruleName);
  return spec !== undefined && (await hasMarker(path, spec));
}

function isValidPlan(value: unknown): value is CleanupPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as {
    schemaVersion?: unknown;
    root?: unknown;
    roots?: unknown;
    entries?: unknown;
  };
  const isStringArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const header =
    (plan.schemaVersion === 1 && typeof plan.root === 'string') ||
    (plan.schemaVersion === 2 && isStringArray(plan.roots));
  return (
    header &&
    Array.isArray(plan.entries) &&
    plan.entries.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PlanEntry).path === 'string' &&
        typeof (entry as PlanEntry).relativePath === 'string' &&
        typeof (entry as PlanEntry).ruleName === 'string' &&
        ['undefined', 'string'].includes(typeof (entry as PlanEntry).kind) &&
        (plan.schemaVersion === 1 || typeof (entry as PlanEntry).root === 'string'),
    )
  );
}

/** Both schema versions as one list of roots and entries that each carry their root. */
function normalizePlan(plan: CleanupPlan): {
  roots: readonly string[];
  entries: (PlanEntry & { root: string })[];
} {
  if (plan.schemaVersion === 2) return { roots: plan.roots, entries: [...plan.entries] };
  return {
    roots: [plan.root],
    entries: plan.entries.map((entry) => ({ ...entry, root: plan.root })),
  };
}

export async function applyPlan(file: string, yes: boolean, io: PlanIO = {}): Promise<number> {
  const stdout = output(io);
  const stderr = errorOutput(io);
  let plan: ReturnType<typeof normalizePlan>;
  try {
    const parsed: unknown = JSON.parse(
      await readFile(resolve(io.cwd ?? process.cwd(), file), 'utf8'),
    );
    if (!isValidPlan(parsed)) throw new Error('invalid purgeit plan schema');
    plan = normalizePlan(parsed);
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

  const approved: string[] = [];
  let skipped = 0;
  for (const entry of plan.entries) {
    const expectedPath = resolve(entry.root, entry.relativePath);
    if (
      !plan.roots.includes(entry.root) ||
      entry.path !== expectedPath ||
      relative(entry.root, expectedPath).startsWith('..') ||
      !(await stillMatchesRule(expectedPath, entry))
    ) {
      skipped++;
      stderr(`warning: skipped invalid plan entry ${entry.relativePath}`);
      continue;
    }
    try {
      const metadata = await stat(expectedPath);
      if (
        !metadata.isDirectory() ||
        (entry.lastModified !== null && metadata.mtimeMs !== entry.lastModified)
      ) {
        skipped++;
        stderr(`warning: skipped changed artifact ${entry.relativePath}`);
        continue;
      }
      const reason = await findProtection(expectedPath);
      if (reason !== undefined) {
        skipped++;
        stderr(
          `warning: skipped protected artifact ${entry.relativePath} (${PROTECTION_DESCRIPTIONS[reason]})`,
        );
        continue;
      }
      approved.push(expectedPath);
    } catch {
      skipped++;
      stderr(`warning: skipped missing artifact ${entry.relativePath}`);
    }
  }

  if (approved.length === 0) {
    stdout(`No approved artifacts remain to delete${skipped > 0 ? `; ${skipped} skipped` : ''}.`);
    return skipped > 0 ? 1 : 0;
  }
  const code = await confirmAndDelete(
    { stdout, stderr, confirm: io.confirm ?? defaultConfirm },
    { confirmQuestion: `Delete ${approved.length} approved artifact(s)?`, yes },
    async function* () {
      for await (const event of deleteEntries(approved, {
        signal: io.signal,
        concurrency: 8,
        roots: plan.roots,
        idleForMs: io.idleForMs ?? DEFAULT_IDLE_MS,
      })) {
        if (event.type === 'deleting') yield { type: 'deleting', key: event.path };
        else if (event.type === 'deleted')
          yield { type: 'deleted', key: event.path, dryRun: event.dryRun };
        else if (event.type === 'error')
          yield { type: 'error', key: event.path, message: event.message };
        else yield { type: 'done', deleted: event.deleted, failed: event.failed };
      }
    },
  );
  return code === 0 && skipped > 0 ? 1 : code;
}
