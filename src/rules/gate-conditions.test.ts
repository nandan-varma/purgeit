import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { GATED_NAMES } from './default-rules.js';
import { DEFAULT_GATES } from './gate-conditions.js';
import { createGateContext } from './gate-context.js';

function ctxFor(root: string, candidateName: string) {
  return createGateContext(join(root, candidateName));
}

function gateFor(name: string) {
  const gate = DEFAULT_GATES.get(name);
  if (!gate) throw new Error(`no default gate registered for '${name}'`);
  return gate;
}

describe('DEFAULT_GATES', () => {
  it('has exactly one entry per GATED_NAMES name, no duplicates', () => {
    expect(new Set(GATED_NAMES).size).toBe(GATED_NAMES.length);
    expect([...DEFAULT_GATES.keys()].sort()).toEqual([...GATED_NAMES].sort());
  });
});

describe('Pods gate (CocoaPods)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows Pods next to a Podfile', () => {
    root = buildTree({ Podfile: 'platform :ios\n', Pods: null });
    expect(gateFor('Pods')(ctxFor(root, 'Pods'))).toBe(true);
  });

  it('rejects Pods with no Podfile', () => {
    root = buildTree({ Pods: null });
    expect(gateFor('Pods')(ctxFor(root, 'Pods'))).toBe(false);
  });
});

describe('Carthage gate', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows Carthage next to a Cartfile', () => {
    root = buildTree({ Cartfile: '', Carthage: null });
    expect(gateFor('Carthage')(ctxFor(root, 'Carthage'))).toBe(true);
  });

  it('allows Carthage next to a Cartfile.resolved', () => {
    root = buildTree({ 'Cartfile.resolved': '', Carthage: null });
    expect(gateFor('Carthage')(ctxFor(root, 'Carthage'))).toBe(true);
  });

  it('rejects Carthage with no Cartfile', () => {
    root = buildTree({ Carthage: null });
    expect(gateFor('Carthage')(ctxFor(root, 'Carthage'))).toBe(false);
  });
});

describe('build gate (polyglot)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows build next to a Podfile', () => {
    root = buildTree({ Podfile: 'platform :ios\n', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to a .xcodeproj', () => {
    root = buildTree({ 'App.xcodeproj': null, build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to a .xcworkspace', () => {
    root = buildTree({ 'App.xcworkspace': null, build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to CMakeLists.txt', () => {
    root = buildTree({ 'CMakeLists.txt': '', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to package.json', () => {
    root = buildTree({ 'package.json': '{}', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to pyproject.toml', () => {
    root = buildTree({ 'pyproject.toml': '', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to requirements.txt', () => {
    root = buildTree({ 'requirements.txt': '', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to build.gradle', () => {
    root = buildTree({ 'build.gradle': '', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to build.gradle.kts', () => {
    root = buildTree({ 'build.gradle.kts': '', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('allows build next to pubspec.yaml (Flutter)', () => {
    root = buildTree({ 'pubspec.yaml': '', build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(true);
  });

  it('rejects a bare build directory with no manifest', () => {
    root = buildTree({ build: null });
    expect(gateFor('build')(ctxFor(root, 'build'))).toBe(false);
  });
});

describe('vendor gate (polyglot)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows vendor next to composer.json (PHP)', () => {
    root = buildTree({ 'composer.json': '{}', vendor: null });
    expect(gateFor('vendor')(ctxFor(root, 'vendor'))).toBe(true);
  });

  it('allows vendor next to go.mod (Go)', () => {
    root = buildTree({ 'go.mod': 'module example\n', vendor: null });
    expect(gateFor('vendor')(ctxFor(root, 'vendor'))).toBe(true);
  });

  it('rejects vendor with no composer.json or go.mod', () => {
    root = buildTree({ vendor: null });
    expect(gateFor('vendor')(ctxFor(root, 'vendor'))).toBe(false);
  });
});

describe('.gradle gate', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows .gradle next to build.gradle', () => {
    root = buildTree({ 'build.gradle': '', '.gradle': null });
    expect(gateFor('.gradle')(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('allows .gradle next to build.gradle.kts', () => {
    root = buildTree({ 'build.gradle.kts': '', '.gradle': null });
    expect(gateFor('.gradle')(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('allows .gradle next to settings.gradle', () => {
    root = buildTree({ 'settings.gradle': '', '.gradle': null });
    expect(gateFor('.gradle')(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('allows .gradle next to settings.gradle.kts', () => {
    root = buildTree({ 'settings.gradle.kts': '', '.gradle': null });
    expect(gateFor('.gradle')(ctxFor(root, '.gradle'))).toBe(true);
  });

  it('rejects a bare .gradle directory with no manifest', () => {
    root = buildTree({ '.gradle': null });
    expect(gateFor('.gradle')(ctxFor(root, '.gradle'))).toBe(false);
  });
});

describe('.cxx gate (Android NDK)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows .cxx next to build.gradle.kts', () => {
    root = buildTree({ 'build.gradle.kts': '', '.cxx': null });
    expect(gateFor('.cxx')(ctxFor(root, '.cxx'))).toBe(true);
  });

  it('rejects a bare .cxx directory with no manifest', () => {
    root = buildTree({ '.cxx': null });
    expect(gateFor('.cxx')(ctxFor(root, '.cxx'))).toBe(false);
  });
});

describe('bin/obj gates (.NET, plus Eclipse for bin)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows bin next to a .csproj', () => {
    root = buildTree({ 'App.csproj': '', bin: null });
    expect(gateFor('bin')(ctxFor(root, 'bin'))).toBe(true);
  });

  it('allows obj next to a .sln', () => {
    root = buildTree({ 'App.sln': '', obj: null });
    expect(gateFor('obj')(ctxFor(root, 'obj'))).toBe(true);
  });

  it('allows bin next to a .classpath (Eclipse Java)', () => {
    root = buildTree({ '.classpath': '', bin: null });
    expect(gateFor('bin')(ctxFor(root, 'bin'))).toBe(true);
  });

  it('rejects bin next to a bare .classpath for obj (Eclipse has no obj/ convention)', () => {
    root = buildTree({ '.classpath': '', obj: null });
    expect(gateFor('obj')(ctxFor(root, 'obj'))).toBe(false);
  });

  it('rejects bin/obj with no manifest', () => {
    root = buildTree({ bin: null, obj: null });
    expect(gateFor('bin')(ctxFor(root, 'bin'))).toBe(false);
    expect(gateFor('obj')(ctxFor(root, 'obj'))).toBe(false);
  });
});

describe('Elixir gates (_build, deps)', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows _build and deps next to mix.exs', () => {
    root = buildTree({ 'mix.exs': '', _build: null, deps: null });
    expect(gateFor('_build')(ctxFor(root, '_build'))).toBe(true);
    expect(gateFor('deps')(ctxFor(root, 'deps'))).toBe(true);
  });

  it('rejects _build and deps with no mix.exs', () => {
    root = buildTree({ _build: null, deps: null });
    expect(gateFor('_build')(ctxFor(root, '_build'))).toBe(false);
    expect(gateFor('deps')(ctxFor(root, 'deps'))).toBe(false);
  });
});

describe('Ruby pkg gate', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('allows pkg next to a Gemfile', () => {
    root = buildTree({ Gemfile: '', pkg: null });
    expect(gateFor('pkg')(ctxFor(root, 'pkg'))).toBe(true);
  });

  it('rejects pkg with no Gemfile', () => {
    root = buildTree({ pkg: null });
    expect(gateFor('pkg')(ctxFor(root, 'pkg'))).toBe(false);
  });
});
