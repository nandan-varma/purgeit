import { readdir } from 'node:fs/promises';

/**
 * Locates a directory shipped in the npm package, relative to this module.
 * The CLI runs both as built `dist/cli.js` (one directory below the package
 * root) and straight from `src/cli/*.ts` in development (two below), so both
 * candidates are tried — the same trick cli.ts's readOwnVersion() uses.
 */
export async function resolvePackageDir(relativeDir: string): Promise<URL> {
  const dir = relativeDir.endsWith('/') ? relativeDir : `${relativeDir}/`;
  for (const url of [
    new URL(`../${dir}`, import.meta.url),
    new URL(`../../${dir}`, import.meta.url),
  ]) {
    try {
      await readdir(url);
      return url;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`could not locate ${dir} relative to the installed package`);
}
