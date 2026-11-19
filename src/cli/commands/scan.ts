import { compareGroups, groupProjects, isDormant } from '../../scan/projects.js';
import { compareEntries, type Entry, scan, type ScanSummary } from '../../scan/scan.js';
import { formatSize } from '../../units.js';
import type { CliEnv } from '../env.js';
import type { GroupBy, ScanFlags } from '../flags.js';
import { resolveScan } from '../options.js';
import { renderEntries, renderProjects, renderSummary } from '../render.js';
import { toReport, toReportEntry } from '../report.js';

export interface ScanCommandFlags extends ScanFlags {
  format: 'text' | 'json' | 'ndjson';
  by: GroupBy;
}

/** Lists what could be cleaned. Never deletes. */
export async function runScan(
  dirs: readonly string[],
  flags: ScanCommandFlags,
  env: CliEnv,
): Promise<number> {
  const resolved = await resolveScan(dirs, flags, env, '0');
  const entries: Entry[] = [];
  let summary: ScanSummary | undefined;
  const showProgress = env.interactive && flags.format === 'text';
  let found = 0;

  for await (const event of scan(resolved.roots, {
    ...resolved.options,
    signal: env.signal,
  })) {
    if (flags.format === 'ndjson') {
      if (event.type === 'entry') {
        env.out(JSON.stringify({ type: 'entry', entry: toReportEntry(event.entry) }));
      } else if (event.type === 'done') {
        env.out(JSON.stringify({ type: 'done', summary: event.summary }));
      }
    }
    if (event.type === 'found') {
      found++;
      if (showProgress) process.stderr.write(`\rscanning… ${found} found`);
    } else if (event.type === 'entry') {
      entries.push(event.entry);
    } else if (event.type === 'done') {
      summary = event.summary;
    }
  }
  if (showProgress) process.stderr.write('\r\u001b[K');
  if (summary === undefined) return 130;

  entries.sort(compareEntries);
  if (flags.format === 'json') {
    env.out(
      JSON.stringify(
        toReport(resolved.roots, entries, summary, Date.now(), resolved.dormantMs),
        null,
        2,
      ),
    );
  } else if (flags.format === 'text') {
    const now = Date.now();
    const groups = groupProjects(entries).toSorted(compareGroups(now, resolved.dormantMs));
    const byProject = flags.by === 'project' && groups.length > 1;
    const table = byProject
      ? renderProjects(groups, now, resolved.dormantMs)
      : renderEntries(entries, now, env.home);
    if (table !== '') env.out(`${table}\n`);
    env.out(renderSummary(summary, resolved.roots.length));
    const dormant = groups.filter((group) => isDormant(group, now, resolved.dormantMs));
    if (dormant.length > 0) {
      const bytes = dormant.reduce((sum, group) => sum + group.bytes, 0);
      env.out(
        `${formatSize(bytes)} of that is in ${dormant.length} dormant project${dormant.length === 1 ? '' : 's'} — \`purgeit clean --stale\` targets exactly those.`,
      );
    }
  }
  return 0;
}
