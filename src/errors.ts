/** A failure the user can fix (bad flag, bad config, unreadable plan): reported plainly, never with a stack. */
export class PurgeitError extends Error {
  override name = 'PurgeitError';
}
