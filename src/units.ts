import bytes from 'bytes';
import ms from 'ms';
import { PurgeitError } from './errors.js';

const DURATION = /^(?:0|\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w|y))$/i;

export function isDuration(input: string): boolean {
  return DURATION.test(input.trim());
}

export function isSize(input: string): boolean {
  const parsed = bytes.parse(input.trim());
  return parsed !== null && Number.isFinite(parsed) && parsed >= 0;
}

/** "7d", "36h", "0" → milliseconds. */
export function parseDuration(input: string): number {
  if (!isDuration(input)) {
    throw new PurgeitError(`Invalid duration "${input}" — expected e.g. 90m, 36h, 7d, 2w, or 0.`);
  }
  return ms(input.trim() as ms.StringValue);
}

/** "10MB", "500 KB", "0" → bytes (binary units, like `du`). */
export function parseSize(input: string): number {
  if (!isSize(input)) {
    throw new PurgeitError(`Invalid size "${input}" — expected e.g. 500KB, 10MB, 1GB, or 0.`);
  }
  return bytes.parse(input.trim()) as number;
}

export function formatSize(size: number): string {
  return bytes.format(size, { unitSeparator: ' ', decimalPlaces: 1 }) ?? '0 B';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact age for table cells: "now", "5m", "3h", "34d", "8mo", "2y". */
export function formatAge(elapsedMs: number): string {
  if (elapsedMs < MINUTE) return 'now';
  if (elapsedMs < HOUR) return `${Math.floor(elapsedMs / MINUTE)}m`;
  if (elapsedMs < DAY) return `${Math.floor(elapsedMs / HOUR)}h`;
  const days = Math.floor(elapsedMs / DAY);
  if (days < 60) return `${days}d`;
  if (days < 730) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** A duration in prose: "7 days", "36 hours". */
export function formatDuration(durationMs: number): string {
  return ms(durationMs, { long: true });
}
