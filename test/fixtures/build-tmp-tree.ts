import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
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

/**
 * Sets the mtime/atime of `path` and everything below it to `days` ago, so a
 * fixture looks like a long-unused artifact to recency guards (a freshly built
 * tree is, correctly, "recently active").
 */
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

/**
 * Runs `fn` with the home directory pointed at `home`. Node's os.homedir()
 * reads HOME on POSIX but USERPROFILE on Windows, so both are set.
 */
export async function withHome<T>(home: string, fn: () => T | Promise<T>): Promise<T> {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
