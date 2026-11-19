import { describe, expect, it } from 'vitest';

import { buildTree } from '../../test/tree.js';
import { describeWhen } from './catalog/describe.js';
import { ConditionSchema, findProof, WhenSchema } from './condition.js';

const names = (...list: string[]) => new Set(list);

describe('findProof', () => {
  it('proves a file from the listing', async () => {
    expect(await findProof({ file: 'package.json' }, '/x', names('package.json'))).toEqual({
      file: 'package.json',
    });
    expect(await findProof({ file: 'package.json' }, '/x', names('other'))).toBeUndefined();
  });

  it('proves a glob, dotfiles included', async () => {
    expect(await findProof({ glob: '*.xcodeproj' }, '/x', names('App.xcodeproj'))).toBeDefined();
    expect(await findProof({ glob: '*rc' }, '/x', names('.npmrc'))).toBeDefined();
    expect(await findProof({ glob: '*.xcodeproj' }, '/x', names('App.swift'))).toBeUndefined();
  });

  it('proves a grep by reading the file', async () => {
    const dir = buildTree({ Makefile: 'all:\nbuild:\n\tcc x.c\n' });
    const when = { grep: { file: 'Makefile', pattern: '^build:' } };
    expect(await findProof(when, dir, names('Makefile'))).toEqual(when);
    expect(
      await findProof({ grep: { ...when.grep, pattern: '^nope:' } }, dir, names('Makefile')),
    ).toBeUndefined();
  });

  it('treats an unreadable grep target as no proof', async () => {
    const dir = buildTree({ Makefile: null });
    const when = { grep: { file: 'Makefile', pattern: 'x' } };
    expect(await findProof(when, dir, names('Makefile'))).toBeUndefined();
    expect(await findProof(when, dir, names())).toBeUndefined();
  });

  it('returns the first condition of a list that holds', async () => {
    const when = [{ file: 'a' }, { file: 'b' }];
    expect(await findProof(when, '/x', names('b', 'c'))).toEqual({ file: 'b' });
    expect(await findProof(when, '/x', names('c'))).toBeUndefined();
  });
});

describe('describeWhen', () => {
  it('reads as prose', () => {
    expect(describeWhen([{ file: 'Podfile' }, { glob: '*.xcodeproj' }])).toBe(
      'Podfile or *.xcodeproj',
    );
    expect(describeWhen({ grep: { file: 'Makefile', pattern: '^build:' } })).toBe(
      'Makefile matching /^build:/',
    );
  });
});

describe('schema', () => {
  it('rejects paths, unknown keys, empty lists and bad regexes', () => {
    expect(ConditionSchema.safeParse({ file: 'a/b' }).success).toBe(false);
    expect(ConditionSchema.safeParse({ file: 'a', glob: 'b' }).success).toBe(false);
    expect(WhenSchema.safeParse([]).success).toBe(false);
    expect(ConditionSchema.safeParse({ grep: { file: 'a', pattern: '(' } }).success).toBe(false);
    expect(WhenSchema.safeParse([{ file: 'a' }, { glob: '*.b' }]).success).toBe(true);
  });
});
