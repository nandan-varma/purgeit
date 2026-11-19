import { homedir } from 'node:os';
import { join, sep } from 'node:path';

/** Folders that cloud-sync clients watch; deleting thousands of files there triggers slow syncs. */
const PROVIDERS: readonly (readonly [string, string])[] = [
  ['iCloud Drive', join('Library', 'Mobile Documents')],
  ['Cloud storage', join('Library', 'CloudStorage')],
  ['Dropbox', 'Dropbox'],
  ['OneDrive', 'OneDrive'],
  ['Google Drive', 'Google Drive'],
];

/** The sync provider that owns `path`, if it sits in a synced folder. */
export function syncProvider(path: string, home = homedir()): string | undefined {
  const relative = path.startsWith(home + sep) ? path.slice(home.length + 1) : path;
  return PROVIDERS.find(([, folder]) =>
    `${sep}${relative}${sep}`.includes(`${sep}${folder}${sep}`),
  )?.[0];
}
