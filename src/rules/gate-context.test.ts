import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { createGateContext, globToRegExp } from './gate-context.js';

describe('globToRegExp', () => {
  it('matches a literal suffix pattern', () => {
    const re = globToRegExp('*.xcodeproj');
    expect(re.test('App.xcodeproj')).toBe(true);
    expect(re.test('App.xcworkspace')).toBe(false);
  });

  it('escapes regex-special characters in the literal portion', () => {
    const re = globToRegExp('a.b+c');
    expect(re.test('a.b+c')).toBe(true);
    expect(re.test('aXbXc')).toBe(false);
  });

  it('supports the ? wildcard', () => {
    const re = globToRegExp('a?c');
    expect(re.test('abc')).toBe(true);
    expect(re.test('ac')).toBe(false);
  });
});

describe('createGateContext', () => {
  let root: string;

  afterEach(() => {
    cleanupTree(root);
  });

  it('siblingFile reports existence relative to the parent directory', () => {
    root = buildTree({ Podfile: 'target :App do\nend\n', Pods: null });
    const ctx = createGateContext(join(root, 'Pods'));
    expect(ctx.path).toBe(join(root, 'Pods'));
    expect(ctx.parent).toBe(root);
    expect(ctx.siblingFile('Podfile')).toBe(true);
    expect(ctx.siblingFile('missing.txt')).toBe(false);
  });

  it('siblingGlob matches any sibling entry', () => {
    root = buildTree({ 'App.xcodeproj': null, build: null });
    const ctx = createGateContext(join(root, 'build'));
    expect(ctx.siblingGlob('*.xcodeproj')).toBe(true);
    expect(ctx.siblingGlob('*.xcworkspace')).toBe(false);
  });

  it('siblingGlob returns false when the parent cannot be read', () => {
    root = buildTree({});
    const ctx = createGateContext(join(root, 'nonexistent-parent', 'build'));
    expect(ctx.siblingGlob('*.csproj')).toBe(false);
  });

  it('siblingGrep matches file contents against a pattern', () => {
    root = buildTree({ 'Cargo.toml': '[package]\nname = "x"\n', target: null });
    const ctx = createGateContext(join(root, 'target'));
    expect(ctx.siblingGrep('Cargo.toml', /^\[package\]/m)).toBe(true);
    expect(ctx.siblingGrep('Cargo.toml', /^\[workspace\]/m)).toBe(false);
  });

  it('siblingGrep returns false when the sibling file does not exist', () => {
    root = buildTree({ build: null });
    const ctx = createGateContext(join(root, 'build'));
    expect(ctx.siblingGrep('Cargo.toml', /./)).toBe(false);
  });
});
