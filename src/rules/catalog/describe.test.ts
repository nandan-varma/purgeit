import { describe, expect, it } from 'vitest';
import { describeWhen } from './describe.js';

describe('describeWhen', () => {
  it('describes file, glob and grep conditions, singly or as alternatives', () => {
    expect(describeWhen({ file: 'Podfile' })).toBe('Podfile');
    expect(describeWhen([{ glob: '*.csproj' }, { file: 'x.sln' }])).toBe('*.csproj or x.sln');
    expect(describeWhen({ grep: { file: 'Makefile', pattern: '^build:' } })).toBe(
      'Makefile (matching /^build:/)',
    );
  });
});
