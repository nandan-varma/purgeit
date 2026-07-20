import type { SortKey } from './state.js';

/** Format a byte count for display in the TUI. */
export function fmtSize(bytes: number | null): string {
  if (bytes === null) return '   ...';
  if (bytes < 1024) return `${bytes} B`.padStart(6);
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`.padStart(6);
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`.padStart(6);
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`.padStart(6);
}

/** Truncate a path to fit within maxWidth, showing the last segments. */
export function truncatePath(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  const segments = path.split('/');
  // Keep the last 2 segments (dir + name) and prepend ...
  const tail = segments.slice(-2).join('/');
  return `...${tail.slice(-(maxWidth - 3))}`;
}

/** Sort label for display. */
export function sortLabel(key: SortKey, dir: 'asc' | 'desc'): string {
  const arrow = dir === 'asc' ? '↑' : '↓';
  return `${key} ${arrow}`;
}
