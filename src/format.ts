const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

/**
 * Parses a human size string like "10MB", "500 KB", "2GB" into bytes. Bare
 * numbers are treated as bytes. Throws on anything unparseable — `--min-size`
 * should fail loudly on a typo rather than silently matching nothing.
 */
export function parseSizeString(input: string): number {
  const trimmed = input.trim();
  const match = /^(\d*\.?\d+)\s*([a-zA-Z]*)$/.exec(trimmed);
  if (!match) {
    throw new Error(
      `invalid size '${input}' (expected e.g. "10MB", "500KB", or a plain byte count)`,
    );
  }
  // Regex guarantees both captures are strings — assert to eliminate ?? branches
  const numberPart = match[1] as string;
  const unitPart = match[2] as string;
  const value = Number.parseFloat(numberPart);
  const unit = unitPart.toLowerCase() || 'b';
  const multiplier = SIZE_UNITS[unit];
  if (multiplier === undefined) {
    throw new Error(
      `invalid size unit '${unitPart}' in '${input}' (expected one of B, KB, MB, GB, TB)`,
    );
  }
  return Math.round(value * multiplier);
}

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parses a human duration string like "7d", "24h", "30m" into milliseconds.
 * A bare number is treated as days (the natural scale for "how old is this
 * artifact"). Throws on anything unparseable — `--min-age`/`--max-age`
 * should fail loudly on a typo rather than silently matching nothing.
 */
export function parseDuration(input: string): number {
  const trimmed = input.trim();
  const match = /^(\d*\.?\d+)\s*([a-zA-Z]*)$/.exec(trimmed);
  if (!match) {
    throw new Error(`invalid duration '${input}' (expected e.g. "7d", "24h", "30m")`);
  }
  // Regex guarantees both captures are strings — assert to eliminate ?? branches
  const numberPart = match[1] as string;
  const unitPart = match[2] as string;
  const value = Number.parseFloat(numberPart);
  const unit = unitPart.toLowerCase() || 'd';
  const multiplier = DURATION_UNITS[unit];
  if (multiplier === undefined) {
    throw new Error(
      `invalid duration unit '${unitPart}' in '${input}' (expected one of s, m, h, d, w)`,
    );
  }
  return Math.round(value * multiplier);
}

/** Formats a byte count as a human-readable string (e.g. "4.2 MB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
const MONTH_MS = 2_629_800_000; // 30.44 days, matches a calendar-month average
const YEAR_MS = 31_557_600_000; // 365.25 days

/** Formats an age in milliseconds as a human-readable string (e.g. "3d", "2w", "6mo") for headless text output. */
export function formatDuration(ms: number): string {
  const age = Math.max(0, ms);
  if (age < HOUR_MS) return `${Math.max(1, Math.round(age / MINUTE_MS))}m`;
  if (age < DAY_MS) return `${Math.round(age / HOUR_MS)}h`;
  if (age < WEEK_MS) return `${Math.round(age / DAY_MS)}d`;
  if (age < MONTH_MS) return `${Math.round(age / WEEK_MS)}w`;
  if (age < YEAR_MS) return `${Math.round(age / MONTH_MS)}mo`;
  return `${Math.round(age / YEAR_MS)}y`;
}

/**
 * Narrow an `unknown` caught value to a displayable error message.
 * Use in catch blocks where the caught value is `unknown`:
 * `catch (err) { stderr(formatErrorMessage(err)); return 2; }`
 */
export function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
