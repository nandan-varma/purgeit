import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { deleteEntries } from '../delete/deleter.js';
import { formatErrorMessage } from '../format.js';
import { confirmAndDelete, defaultConfirm } from './report.js';

interface PlanEntry {
  readonly path: string;
  readonly relativePath: string;
  readonly ruleName: string;
  readonly lastModified: number | null;
}

interface CleanupPlan {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly entries: readonly PlanEntry[];
}

interface PlanIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  cwd?: string | undefined;
  confirm?: (question: string) => Promise<boolean>;
  signal?: AbortSignal | undefined;
}

function output(io: PlanIO): (text: string) => void {
  return io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
}

function errorOutput(io: PlanIO): (text: string) => void {
  return io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
}

export async function writePlan(
  report: {
    root: string;
    entries: readonly PlanEntry[];
  },
  file: string,
  io: PlanIO = {},
): Promise<number> {
  const stdout = output(io);
  const path = resolve(io.cwd ?? process.cwd(), file);
  const plan: CleanupPlan = { schemaVersion: 1, root: report.root, entries: report.entries };
  try {
    await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    stdout(`Wrote ${plan.entries.length} approved artifact(s) to ${path}.`);
    return 0;
  } catch (err) {
    errorOutput(io)(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }
}

function isValidPlan(value: unknown): value is CleanupPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as { schemaVersion?: unknown; root?: unknown; entries?: unknown };
  return (
    plan.schemaVersion === 1 &&
    typeof plan.root === 'string' &&
    Array.isArray(plan.entries) &&
    plan.entries.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PlanEntry).path === 'string' &&
        typeof (entry as PlanEntry).relativePath === 'string' &&
        typeof (entry as PlanEntry).ruleName === 'string',
    )
  );
}

export async function applyPlan(file: string, yes: boolean, io: PlanIO = {}): Promise<number> {
  const stdout = output(io);
  const stderr = errorOutput(io);
  let plan: CleanupPlan;
  try {
    const parsed: unknown = JSON.parse(
      await readFile(resolve(io.cwd ?? process.cwd(), file), 'utf8'),
    );
    if (!isValidPlan(parsed)) throw new Error('invalid purgeit plan schema');
    plan = parsed;
  } catch (err) {
    stderr(`purgeit: ${formatErrorMessage(err)}`);
    return 2;
  }

  const approved: string[] = [];
  let skipped = 0;
  for (const entry of plan.entries) {
    const expectedPath = resolve(plan.root, entry.relativePath);
    if (
      entry.path !== expectedPath ||
      relative(plan.root, expectedPath).startsWith('..') ||
      basename(expectedPath) !== entry.ruleName
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
      for await (const event of deleteEntries(approved, { signal: io.signal, concurrency: 8 })) {
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
