import { describe, expect, it } from 'vitest';
import { resolvePackageDir } from './package-path.js';

describe('resolvePackageDir', () => {
  it('finds a directory shipped at the package root, with or without a trailing slash', async () => {
    expect((await resolvePackageDir('skills/purgeit')).href).toMatch(/\/skills\/purgeit\/$/);
    expect((await resolvePackageDir('skills/purgeit/')).href).toMatch(/\/skills\/purgeit\/$/);
  });

  it('throws when neither candidate exists', async () => {
    await expect(resolvePackageDir('no/such/dir')).rejects.toThrow(
      'could not locate no/such/dir/ relative to the installed package',
    );
  });
});
