import { z } from 'zod';

import { errorMessage, PurgeitError } from '../errors.js';
import type { Entry, ScanSummary } from '../scan/scan.js';

/** The machine-readable scan, and the plan `purgeit clean --plan` accepts. */
export interface ScanReport {
  readonly version: 1;
  readonly roots: readonly string[];
  readonly entries: readonly ReportEntry[];
  readonly summary: ScanSummary;
}

interface ReportEntry {
  readonly path: string;
  readonly rule: string;
  readonly kind: string;
  readonly categories: readonly string[];
  readonly evidence: string | null;
  readonly bytes: number;
  readonly files: number;
  readonly lastActive: number;
  readonly protection: string | null;
}

export function toReportEntry(entry: Entry): ReportEntry {
  return {
    path: entry.path,
    rule: entry.rule.name,
    kind: entry.rule.kind,
    categories: entry.rule.categories,
    evidence: entry.evidence ?? null,
    bytes: entry.bytes,
    files: entry.files,
    lastActive: entry.lastActive,
    protection: entry.protection ?? null,
  };
}

export function toReport(
  roots: readonly string[],
  entries: readonly Entry[],
  summary: ScanSummary,
): ScanReport {
  return { version: 1, roots, entries: entries.map(toReportEntry), summary };
}

const PlanSchema = z.object({
  version: z.literal(1),
  roots: z.array(z.string()).min(1),
  entries: z.array(
    z.object({
      path: z.string(),
      bytes: z.number().optional(),
      lastActive: z.number().optional(),
      protection: z.string().nullable().optional(),
    }),
  ),
});

export type Plan = z.infer<typeof PlanSchema>;

/** Parses a `purgeit scan --format json` report that was reviewed and trimmed into a plan. */
export function parsePlan(raw: string, source: string): Plan {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new PurgeitError(`${source} is not valid JSON: ${errorMessage(error)}`);
  }
  const parsed = PlanSchema.safeParse(json);
  if (!parsed.success) {
    throw new PurgeitError(`${source} is not a purgeit plan:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
