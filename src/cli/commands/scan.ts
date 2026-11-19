import { type Entry, type ScanSummary, scan } from '../../scan/scan.js';
import type { CliEnv } from '../env.js';
import type { ScanFlags } from '../flags.js';
import { resolveScan } from '../options.js';
import { renderEntries, renderSummary } from '../render.js';
import { toReport, toReportEntry } from '../report.js';

export interface ScanCommandFlags extends ScanFlags {
  format: 'text' | 'json' | 'ndjson';
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
    ...(env.signal === undefined ? {} : { signal: env.signal }),
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

  entries.sort(
    (a, b) =>
      Number(a.protection !== undefined) - Number(b.protection !== undefined) || b.bytes - a.bytes,
  );
  if (flags.format === 'json') {
    env.out(JSON.stringify(toReport(resolved.roots, entries, summary), null, 2));
  } else if (flags.format === 'text') {
    const table = renderEntries(entries, Date.now(), env.home);
    if (table !== '') env.out(`${table}\n`);
    env.out(renderSummary(summary, resolved.roots.length));
  }
  return 0;
}
