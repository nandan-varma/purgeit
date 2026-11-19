/** A failure the user can fix (bad flag, bad config, unreadable plan): reported plainly, never with a stack. */
export class PurgeitError extends Error {
  override name = 'PurgeitError';
}

/** The message of anything thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The Node errno code (`ENOENT`, `EACCES`, …) of a thrown filesystem error, if it has one. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
