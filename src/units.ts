import bytes from 'bytes';

import { PurgeitError } from './errors.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNITS: Readonly<Record<string, number>> = {
  ms: 1,
  s: SECOND,
  m: MINUTE,
  h: HOUR,
  d: DAY,
  w: 7 * DAY,
  y: 365 * DAY,
};

const DURATION = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|y)$/i;

function toDuration(input: string): number | undefined {
  const text = input.trim();
  if (text === '0') return 0;
  const match = DURATION.exec(text);
  const unit = UNITS[match?.[2]?.toLowerCase() ?? ''];
  return match?.[1] === undefined || unit === undefined ? undefined : Number(match[1]) * unit;
}

function toSize(input: string): number | undefined {
  const parsed = bytes.parse(input.trim());
  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export const isDuration = (input: string): boolean => toDuration(input) !== undefined;
export const isSize = (input: string): boolean => toSize(input) !== undefined;

/** "7d", "36h", "0" → milliseconds. */
export function parseDuration(input: string): number {
  const duration = toDuration(input);
  if (duration === undefined) {
    throw new PurgeitError(`Invalid duration "${input}" — expected e.g. 90m, 36h, 7d, 2w, or 0.`);
  }
  return duration;
}

/** "10MB", "500 KB", "0" → bytes (binary units, like `du`). */
export function parseSize(input: string): number {
  const size = toSize(input);
  if (size === undefined) {
    throw new PurgeitError(`Invalid size "${input}" — expected e.g. 500KB, 10MB, 1GB, or 0.`);
  }
  return size;
}

export function formatSize(size: number): string {
  return bytes.format(size, { unitSeparator: ' ', decimalPlaces: 1 }) ?? '0 B';
}

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

/** "5m ago", "3d ago", or "just now". */
export function formatAgo(elapsedMs: number): string {
  const age = formatAge(elapsedMs);
  return age === 'now' ? 'just now' : `${age} ago`;
}

const PROSE_UNITS = [
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
] as const;

/** A duration in prose: "7 days", "36 hours". */
export function formatDuration(durationMs: number): string {
  const [unit, size] = PROSE_UNITS.find(([, length]) => durationMs >= length) ?? PROSE_UNITS[2];
  const count = Math.round(durationMs / size);
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
