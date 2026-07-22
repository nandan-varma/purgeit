import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import { detectProjectTypes } from './project-types.js';

describe('detectProjectTypes', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('labels a Next.js project as "next", not "node"', async () => {
    root = buildTree({ 'package.json': '{}', 'next.config.js': 'module.exports = {}' });
    expect(await detectProjectTypes(root)).toEqual(['next']);
  });

  it('labels a plain Node project as "node"', async () => {
    root = buildTree({ 'package.json': '{}' });
    expect(await detectProjectTypes(root)).toEqual(['node']);
  });

  it('labels a React Native (iOS) project', async () => {
    root = buildTree({ 'package.json': '{}', ios: { Podfile: 'platform :ios\n' } });
    expect(await detectProjectTypes(root)).toEqual(['node', 'react-native']);
  });

  it('labels a React Native (Android) project', async () => {
    root = buildTree({ 'package.json': '{}', android: { 'build.gradle': '' } });
    expect(await detectProjectTypes(root)).toEqual(['node', 'react-native']);
  });

  it('labels a Tauri project as both node and tauri', async () => {
    root = buildTree({ 'package.json': '{}', 'src-tauri': { 'Cargo.toml': '[package]\n' } });
    expect(await detectProjectTypes(root)).toEqual(['node', 'tauri']);
  });

  it('labels a Rust project', async () => {
    root = buildTree({ 'Cargo.toml': '[package]\n' });
    expect(await detectProjectTypes(root)).toEqual(['rust']);
  });

  it('labels a Python project', async () => {
    root = buildTree({ 'pyproject.toml': '' });
    expect(await detectProjectTypes(root)).toEqual(['python']);
  });

  it('labels an SPM project', async () => {
    root = buildTree({ 'Package.swift': 'let package = Package(name: "x")' });
    expect(await detectProjectTypes(root)).toEqual(['spm']);
  });

  it('labels an Xcode project', async () => {
    root = buildTree({ 'App.xcodeproj': { 'project.pbxproj': '' } });
    expect(await detectProjectTypes(root)).toEqual(['xcode']);
  });

  it('labels a .NET project (csproj)', async () => {
    root = buildTree({ 'App.csproj': '' });
    expect(await detectProjectTypes(root)).toEqual(['dotnet']);
  });

  it('labels a .NET project (sln)', async () => {
    root = buildTree({ 'App.sln': '' });
    expect(await detectProjectTypes(root)).toEqual(['dotnet']);
  });

  it('labels a CMake project', async () => {
    root = buildTree({ 'CMakeLists.txt': '' });
    expect(await detectProjectTypes(root)).toEqual(['cmake']);
  });

  it('returns an empty list for an unrecognized directory', async () => {
    root = buildTree({ 'readme.txt': 'hello' });
    expect(await detectProjectTypes(root)).toEqual([]);
  });

  it('returns an empty list when the directory does not exist', async () => {
    root = buildTree({});
    expect(await detectProjectTypes(`${root}/does-not-exist`)).toEqual([]);
  });

  it('appends matching extra detectors from user config after built-ins', async () => {
    root = buildTree({ 'package.json': '{}', 'mkdocs.yml': '' });
    const extra = [
      {
        id: 'mkdocs',
        label: 'mkdocs',
        detect: (dir: string) => existsSync(join(dir, 'mkdocs.yml')),
      },
    ];
    expect(await detectProjectTypes(root, extra)).toEqual(['node', 'mkdocs']);
  });
});
