import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * A directory tree as data: a string is a file's contents, `null` an empty
 * directory, an object a directory.
 */
export interface TreeSpec {
  [name: string]: string | null | TreeSpec;
}

const created: string[] = [];

/** Materializes `spec` in a fresh temp directory that `cleanupTrees` removes. Returns its real path. */
export function buildTree(spec: TreeSpec): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'purgeit-test-')));
  created.push(root);
  write(root, spec);
  return root;
}

function write(dir: string, spec: TreeSpec): void {
  for (const [name, value] of Object.entries(spec)) {
    const path = join(dir, name);
    if (typeof value === 'string') {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, value);
    } else {
      mkdirSync(path, { recursive: true });
      if (value !== null) write(path, value);
    }
  }
}

export function cleanupTrees(): void {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** Sets the mtime of `path` and everything below it to `days` ago — a long-unused artifact. */
export function backdate(path: string, days = 30): void {
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const visit = (current: string): void => {
    if (statSync(current).isDirectory()) {
      for (const name of readdirSync(current)) visit(join(current, name));
    }
    utimesSync(current, when, when);
  };
  visit(path);
}

export function hardlink(existing: string, link: string): void {
  linkSync(existing, link);
}

/** A file of `bytes` bytes (random so it is never sparse or compressed away). */
export function blob(bytes: number): string {
  return 'x'.repeat(bytes);
}
