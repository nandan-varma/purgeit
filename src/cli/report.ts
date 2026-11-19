import { z } from 'zod';

import { errorMessage, PurgeitError } from '../errors.js';
import { projectName } from '../scan/project.js';
import { compareGroups, DEFAULT_DORMANT_MS, groupProjects, isDormant } from '../scan/projects.js';
import type { Entry, ScanSummary } from '../scan/scan.js';

/** The machine-readable scan, and the plan `purgeit clean --plan` accepts. */
export interface ScanReport {
  readonly version: 1;
  readonly roots: readonly string[];
  readonly entries: readonly ReportEntry[];
  /** The same entries rolled up per project, dormant and largest first. */
  readonly projects: readonly ReportProject[];
  readonly summary: ScanSummary;
}

interface ReportProject {
  readonly name: string;
  readonly group: string;
  readonly artifacts: number;
  readonly bytes: number;
  readonly protected: number;
  readonly worktrees: number;
  readonly ecosystems: readonly string[];
  readonly touchedAt: number | null;
  readonly lastActive: number;
  /** Not worked on for at least `dormantAfter` (30 days by default). */
  readonly dormant: boolean;
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
  readonly project: string;
  readonly projectRoot: string;
  readonly projectKind: string;
  /** The repository or folder this project is grouped under (a worktree's main repo). */
  readonly projectGroup: string;
  /** Newest git activity in the project (epoch ms), null when git doesn't know. */
  readonly projectTouchedAt: number | null;
  readonly gitIgnored: boolean | null;
  readonly synced: string | null;
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
    project: projectName(entry.project),
    projectRoot: entry.project.root,
    projectKind: entry.project.kind,
    projectGroup: entry.project.group,
    projectTouchedAt: entry.project.touchedAt ?? null,
    gitIgnored: entry.gitIgnored ?? null,
    synced: entry.synced ?? null,
  };
}

export function toReport(
  roots: readonly string[],
  entries: readonly Entry[],
  summary: ScanSummary,
  now = Date.now(),
  dormantAfter = DEFAULT_DORMANT_MS,
): ScanReport {
  const projects = groupProjects(entries)
    .toSorted(compareGroups(now, dormantAfter))
    .map((group): ReportProject => ({
      name: group.name,
      group: group.key,
      artifacts: group.artifacts,
      bytes: group.bytes,
      protected: group.protected,
      worktrees: group.worktrees,
      ecosystems: group.ecosystems,
      touchedAt: group.touchedAt ?? null,
      lastActive: group.lastActive,
      dormant: isDormant(group, now, dormantAfter),
    }));
  return { version: 1, roots, entries: entries.map(toReportEntry), projects, summary };
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
