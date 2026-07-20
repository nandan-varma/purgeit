import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Declarative tree spec: `null` creates an empty directory, a string creates
 * a file with that content, a nested object creates a subdirectory.
 */
export interface TreeSpec {
  [name: string]: string | null | TreeSpec;
}

/** Materializes `spec` under a fresh temp directory and returns its root path. */
export function buildTree(spec: TreeSpec, prefix = 'purgeit-test-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeTree(root, spec);
  return root;
}

function writeTree(dir: string, spec: TreeSpec): void {
  for (const [name, value] of Object.entries(spec)) {
    const path = join(dir, name);
    if (value === null) {
      mkdirSync(path, { recursive: true });
    } else if (typeof value === 'string') {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, value);
    } else {
      mkdirSync(path, { recursive: true });
      writeTree(path, value);
    }
  }
}

/** Recursively removes a tree built by `buildTree`. */
export function cleanupTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
