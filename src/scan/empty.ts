import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * True when nothing but (possibly nested) empty directories lives under
 * `path` — deleting it frees nothing. Stops at the first non-directory entry.
 * Size can't answer this portably: `du` reports an empty directory's own
 * block (4 KB on ext4) on Linux but 0 on APFS. Unreadable counts as not empty.
 */
export async function isEmptyTree(path: string): Promise<boolean> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) return false;
    if (!(await isEmptyTree(join(path, entry.name)))) return false;
  }
  return true;
}
