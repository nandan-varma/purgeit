import type { SortKey } from './state.js';

/** Format a byte count for display in the TUI. */
export function fmtSize(bytes: number | null): string {
  if (bytes === null) return '   ...';
  if (bytes < 1024) return `${bytes} B`.padStart(6);
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`.padStart(6);
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`.padStart(6);
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`.padStart(6);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
const MONTH_MS = 2_629_800_000; // 30.44 days, matches a calendar-month average
const YEAR_MS = 31_557_600_000; // 365.25 days

/** Format an artifact's last-modified age for display in the TUI (e.g. "3d", "2w", "6mo"). */
export function fmtAge(lastModified: number | null): string {
  if (lastModified === null) return '...'.padStart(5);
  const age = Math.max(0, Date.now() - lastModified);
  let value: string;
  if (age < HOUR_MS) value = `${Math.max(1, Math.round(age / MINUTE_MS))}m`;
  else if (age < DAY_MS) value = `${Math.round(age / HOUR_MS)}h`;
  else if (age < WEEK_MS) value = `${Math.round(age / DAY_MS)}d`;
  else if (age < MONTH_MS) value = `${Math.round(age / WEEK_MS)}w`;
  else if (age < YEAR_MS) value = `${Math.round(age / MONTH_MS)}mo`;
  else value = `${Math.round(age / YEAR_MS)}y`;
  return value.padStart(5);
}

/** Sort label for display. */
export function sortLabel(key: SortKey, dir: 'asc' | 'desc'): string {
  const arrow = dir === 'asc' ? '↑' : '↓';
  return `${key} ${arrow}`;
}
