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
  const match = /^([\d.]+)\s*([a-zA-Z]*)$/.exec(trimmed);
  if (!match) {
    throw new Error(`invalid size '${input}' (expected e.g. "10MB", "500KB", or a plain byte count)`);
  }
  const [, numberPart, unitPart] = match;
  const value = Number.parseFloat(numberPart ?? '');
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`invalid size '${input}' (expected e.g. "10MB", "500KB", or a plain byte count)`);
  }
  const unit = (unitPart ?? '').toLowerCase() || 'b';
  const multiplier = SIZE_UNITS[unit];
  if (multiplier === undefined) {
    throw new Error(`invalid size unit '${unitPart}' in '${input}' (expected one of B, KB, MB, GB, TB)`);
  }
  return Math.round(value * multiplier);
}

/** Formats a byte count as a human-readable string (e.g. "4.2 MB"). */
export function formatBytes(bytes: number): string {
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
