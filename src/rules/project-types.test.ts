import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { detectProjectTypes } from './project-types.js';

describe('detectProjectTypes', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('labels a Next.js project as "next", not "node"', () => {
    root = buildTree({ 'package.json': '{}', 'next.config.js': 'module.exports = {}' });
    expect(detectProjectTypes(root)).toEqual(['next']);
  });

  it('labels a plain Node project as "node"', () => {
    root = buildTree({ 'package.json': '{}' });
    expect(detectProjectTypes(root)).toEqual(['node']);
  });

  it('labels a React Native (iOS) project', () => {
    root = buildTree({ 'package.json': '{}', ios: { Podfile: 'platform :ios\n' } });
    expect(detectProjectTypes(root)).toEqual(['node', 'react-native']);
  });

  it('labels a React Native (Android) project', () => {
    root = buildTree({ 'package.json': '{}', android: { 'build.gradle': '' } });
    expect(detectProjectTypes(root)).toEqual(['node', 'react-native']);
  });

  it('labels a Tauri project as both node and tauri', () => {
    root = buildTree({ 'package.json': '{}', 'src-tauri': { 'Cargo.toml': '[package]\n' } });
    expect(detectProjectTypes(root)).toEqual(['node', 'tauri']);
  });

  it('labels a Rust project', () => {
    root = buildTree({ 'Cargo.toml': '[package]\n' });
    expect(detectProjectTypes(root)).toEqual(['rust']);
  });

  it('labels a Python project', () => {
    root = buildTree({ 'pyproject.toml': '' });
    expect(detectProjectTypes(root)).toEqual(['python']);
  });

  it('labels an SPM project', () => {
    root = buildTree({ 'Package.swift': 'let package = Package(name: "x")' });
    expect(detectProjectTypes(root)).toEqual(['spm']);
  });

  it('labels an Xcode project', () => {
    root = buildTree({ 'App.xcodeproj': { 'project.pbxproj': '' } });
    expect(detectProjectTypes(root)).toEqual(['xcode']);
  });

  it('labels a .NET project (csproj)', () => {
    root = buildTree({ 'App.csproj': '' });
    expect(detectProjectTypes(root)).toEqual(['dotnet']);
  });

  it('labels a .NET project (sln)', () => {
    root = buildTree({ 'App.sln': '' });
    expect(detectProjectTypes(root)).toEqual(['dotnet']);
  });

  it('labels a CMake project', () => {
    root = buildTree({ 'CMakeLists.txt': '' });
    expect(detectProjectTypes(root)).toEqual(['cmake']);
  });

  it('returns an empty list for an unrecognized directory', () => {
    root = buildTree({ 'readme.txt': 'hello' });
    expect(detectProjectTypes(root)).toEqual([]);
  });

  it('returns an empty list when the directory does not exist', () => {
    root = buildTree({});
    expect(detectProjectTypes(`${root}/does-not-exist`)).toEqual([]);
  });

  it('appends matching extra detectors from user config after built-ins', () => {
    root = buildTree({ 'package.json': '{}', 'mkdocs.yml': '' });
    const extra = [
      {
        id: 'mkdocs',
        label: 'mkdocs',
        detect: (dir: string) => existsSync(join(dir, 'mkdocs.yml')),
      },
    ];
    expect(detectProjectTypes(root, extra)).toEqual(['node', 'mkdocs']);
  });
});
