import { describe, expect, it } from 'vitest';
import { assertPurgeitUserConfig } from './schema.js';

function ok(raw: unknown): void {
  expect(() => assertPurgeitUserConfig(raw)).not.toThrow();
}

function bad(raw: unknown, match: RegExp): void {
  expect(() => assertPurgeitUserConfig(raw)).toThrow(match);
}

describe('assertPurgeitUserConfig', () => {
  it('accepts an empty object', () => ok({}));

  it('accepts a fully populated valid config', () =>
    ok({
      extends: 'merge',
      alwaysSafe: ['.turbo-fixture-cache'],
      alwaysSafeRemove: ['node_modules'],
      gated: [
        { name: 'declarative-file', when: { file: 'CMakeLists.txt' } },
        { name: 'declarative-glob', when: { glob: '*.custom' } },
        {
          name: 'declarative-grep',
          when: { grep: { file: 'mkdocs.yml', pattern: '^site_name:' } },
        },
        { name: 'declarative-array', when: [{ file: 'a' }, { glob: '*.b' }] },
        { name: 'function-rule', gate: () => true },
      ],
      gatedRemove: ['bin'],
      skipDirs: ['archive'],
      pruneNames: ['.jj'],
      targets: { python: ['__pycache__', '.venv'] },
    }));

  it('rejects a non-object', () => {
    bad(null, /expected an object/);
    bad('nope', /expected an object/);
    bad([], /expected an object/);
  });

  it('rejects an invalid "extends" value', () =>
    bad({ extends: 'bogus' }, /extends.*merge.*replace/));

  it('rejects non-string-array fields', () => {
    bad({ alwaysSafe: 'not-an-array' }, /alwaysSafe.*array of strings/);
    bad({ alwaysSafe: [1, 2] }, /alwaysSafe.*array of strings/);
    bad({ alwaysSafeRemove: [1] }, /alwaysSafeRemove/);
    bad({ gatedRemove: [1] }, /gatedRemove/);
    bad({ skipDirs: [1] }, /skipDirs/);
    bad({ pruneNames: [1] }, /pruneNames/);
  });

  it('rejects a non-array "gated"', () => bad({ gated: {} }, /gated.*must be an array/));

  it('rejects a gated entry that is not an object', () =>
    bad({ gated: ['not-an-object'] }, /each "gated" entry must be an object/));

  it('rejects a gated entry with no name', () =>
    bad({ gated: [{ when: { file: 'x' } }] }, /non-empty "name"/));

  it('rejects a targets entry whose value is missing (required string array)', () =>
    bad({ targets: { python: undefined } }, /targets\.python.*is required/));

  it('rejects a gated entry missing both when and gate', () =>
    bad({ gated: [{ name: 'x' }] }, /exactly one of "when" or "gate"/));

  it('rejects a gated entry with both when and gate', () =>
    bad(
      { gated: [{ name: 'x', when: { file: 'a' }, gate: () => true }] },
      /exactly one of "when" or "gate"/,
    ));

  it('rejects a gated entry whose gate is not a function', () =>
    bad({ gated: [{ name: 'x', gate: 'nope' }] }, /"gate" must be a function/));

  it('rejects a malformed gate condition', () => {
    bad({ gated: [{ name: 'x', when: 'nope' }] }, /invalid condition/);
    bad({ gated: [{ name: 'x', when: {} }] }, /exactly one of file\/glob\/grep/);
    bad(
      { gated: [{ name: 'x', when: { file: 'a', glob: 'b' } }] },
      /exactly one of file\/glob\/grep/,
    );
    bad({ gated: [{ name: 'x', when: { file: 1 } }] }, /"file" must be a string/);
    bad({ gated: [{ name: 'x', when: { glob: 1 } }] }, /"glob" must be a string/);
    bad({ gated: [{ name: 'x', when: { grep: 'nope' } }] }, /"grep" must be/);
    bad({ gated: [{ name: 'x', when: { grep: { file: 'a' } } }] }, /"grep" must be/);
    bad({ gated: [{ name: 'x', when: { grep: { file: 'a', pattern: 1 } } }] }, /"grep" must be/);
  });

  it('rejects a non-object "targets"', () => {
    bad({ targets: [] }, /targets.*must be an object/);
    bad({ targets: 'nope' }, /targets.*must be an object/);
  });

  it('rejects a targets entry that is not a string array', () =>
    bad({ targets: { python: 'nope' } }, /targets\.python.*array of strings/));

  it('includes the source filepath in the error message when provided', () => {
    expect(() => assertPurgeitUserConfig(null, '/repo/purgeit.config.json')).toThrow(
      /\/repo\/purgeit\.config\.json/,
    );
  });
});
