import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { MarkerSpec } from '../types.js';

/**
 * True if `dir/spec.file` exists and starts with `spec.signature`. Only the
 * signature's bytes are read, and anything unreadable (missing file, a
 * directory with the marker's name, permission errors) is treated as "no
 * marker" — a marker is proof, so its absence must never be guessed at.
 */
export async function hasMarker(dir: string, spec: MarkerSpec): Promise<boolean> {
  const expected = Buffer.from(spec.signature);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(join(dir, spec.file), 'r');
    const buffer = Buffer.alloc(expected.length);
    const { bytesRead } = await handle.read(buffer, 0, expected.length, 0);
    return bytesRead === expected.length && buffer.equals(expected);
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

/**
 * Returns the name of the first marker rule whose marker `dir` carries.
 * `hasFile` lets a caller that already listed `dir` skip the open for markers
 * that aren't there, so a walk pays nothing extra for directories without one.
 */
export async function findMarker(
  dir: string,
  markers: ReadonlyMap<string, MarkerSpec>,
  hasFile: (name: string) => boolean = () => true,
): Promise<string | undefined> {
  for (const [ruleName, spec] of markers) {
    if (hasFile(spec.file) && (await hasMarker(dir, spec))) return ruleName;
  }
  return undefined;
}
