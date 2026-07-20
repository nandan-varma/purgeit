import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { binObjGate, buildGate, DEFAULT_GATES, gradleGate, podsGate } from './gate-conditions.js';
import { createGateContext } from './gate-context.js';

function ctxFor(root: string, candidateName: string) {
  return createGateContext(join(root, candidateName));
}

describe('podsGate', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows Pods next to a Podfile', () => {
    root = buildTree({ Podfile: 'platform :ios\n', Pods: null });
    expect(podsGate(ctxFor(root, 'Pods'))).toBe(true);
  });

  it('rejects Pods with no Podfile', () => {
    root = buildTree({ Pods: null });
    expect(podsGate(ctxFor(root, 'Pods'))).toBe(false);
  });
});

describe('buildGate', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows build next to a Podfile', () => {
    root = buildTree({ Podfile: 'platform :ios\n', build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to a .xcodeproj', () => {
    root = buildTree({ 'App.xcodeproj': null, build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to a .xcworkspace', () => {
    root = buildTree({ 'App.xcworkspace': null, build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to CMakeLists.txt', () => {
    root = buildTree({ 'CMakeLists.txt': '', build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to package.json', () => {
    root = buildTree({ 'package.json': '{}', build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to pyproject.toml', () => {
    root = buildTree({ 'pyproject.toml': '', build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to requirements.txt', () => {
    root = buildTree({ 'requirements.txt': '', build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to build.gradle', () => {
    root = buildTree({ 'build.gradle': '', build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to build.gradle.kts', () => {
    root = buildTree({ 'build.gradle.kts': '', build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(true);
  });

  it('rejects a bare build directory with no manifest', () => {
    root = buildTree({ build: null });
    expect(buildGate(ctxFor(root, 'build'))).toBe(false);
  });
});

describe('gradleGate', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows .gradle next to build.gradle', () => {
    root = buildTree({ 'build.gradle': '', '.gradle': null });
    expect(gradleGate(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('allows .gradle next to build.gradle.kts', () => {
    root = buildTree({ 'build.gradle.kts': '', '.gradle': null });
    expect(gradleGate(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('allows .gradle next to settings.gradle', () => {
    root = buildTree({ 'settings.gradle': '', '.gradle': null });
    expect(gradleGate(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('allows .gradle next to settings.gradle.kts', () => {
    root = buildTree({ 'settings.gradle.kts': '', '.gradle': null });
    expect(gradleGate(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('rejects a bare .gradle directory with no manifest', () => {
    root = buildTree({ '.gradle': null });
    expect(gradleGate(ctxFor(root, '.gradle'))).toBe(false);
  });
});

describe('binObjGate', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows bin next to a .csproj', () => {
    root = buildTree({ 'App.csproj': '', bin: null });
    expect(binObjGate(ctxFor(root, 'bin'))).toBe(true);
  });

  it('allows obj next to a .sln', () => {
    root = buildTree({ 'App.sln': '', obj: null });
    expect(binObjGate(ctxFor(root, 'obj'))).toBe(true);
  });

  it('rejects bin/obj with no .csproj or .sln', () => {
    root = buildTree({ bin: null, obj: null });
    expect(binObjGate(ctxFor(root, 'bin'))).toBe(false);
    expect(binObjGate(ctxFor(root, 'obj'))).toBe(false);
  });
});

describe('DEFAULT_GATES', () => {
  it('has an entry for every GATED_NAMES name', () => {
    expect([...DEFAULT_GATES.keys()].sort()).toEqual(
      ['.gradle', 'Pods', 'bin', 'build', 'obj'].sort(),
    );
  });
});
