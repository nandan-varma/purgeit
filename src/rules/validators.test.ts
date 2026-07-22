import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTree, cleanupTree } from '../../test/fixtures/build-tmp-tree.js';
import {
  validateCargoToml,
  validateNextConfig,
  validatePackageJson,
  validatePackageSwift,
  validatePodfile,
  validateXcodeproj,
} from './validators.js';

describe('validatePackageJson', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for a valid package.json', async () => {
    root = buildTree({ 'package.json': '{"name":"x"}' });
    expect(await validatePackageJson(join(root, 'package.json'))).toBeUndefined();
  });

  it('warns when the file is missing', async () => {
    root = buildTree({});
    expect((await validatePackageJson(join(root, 'package.json')))?.message).toMatch(/not found/);
  });

  it('warns on invalid JSON', async () => {
    root = buildTree({ 'package.json': '{not json' });
    expect((await validatePackageJson(join(root, 'package.json')))?.message).toMatch(
      /invalid JSON/,
    );
  });

  it("warns when 'name' is missing", async () => {
    root = buildTree({ 'package.json': '{}' });
    expect((await validatePackageJson(join(root, 'package.json')))?.message).toMatch(/name/);
  });
});

describe('validateNextConfig', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for a populated next.config.js', async () => {
    root = buildTree({ 'next.config.js': 'module.exports = {}' });
    expect(await validateNextConfig(root)).toBeUndefined();
  });

  it('accepts .ts and .mjs variants', async () => {
    root = buildTree({ 'next.config.ts': 'export default {}' });
    expect(await validateNextConfig(root)).toBeUndefined();
  });

  it('warns when no config file exists', async () => {
    root = buildTree({});
    expect((await validateNextConfig(root))?.message).toMatch(/no next.config/);
  });

  it('warns when the config file is empty', async () => {
    root = buildTree({ 'next.config.mjs': '' });
    expect((await validateNextConfig(root))?.message).toMatch(/empty/);
  });
});

describe('validateCargoToml', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for [package]', async () => {
    root = buildTree({ 'Cargo.toml': '[package]\nname = "x"\n' });
    expect(await validateCargoToml(join(root, 'Cargo.toml'))).toBeUndefined();
  });

  it('passes for [workspace]', async () => {
    root = buildTree({ 'Cargo.toml': '[workspace]\nmembers = []\n' });
    expect(await validateCargoToml(join(root, 'Cargo.toml'))).toBeUndefined();
  });

  it('warns when the file is missing', async () => {
    root = buildTree({});
    expect((await validateCargoToml(join(root, 'Cargo.toml')))?.message).toMatch(/not found/);
  });

  it('warns when neither section is present', async () => {
    root = buildTree({ 'Cargo.toml': 'not a real manifest\n' });
    expect((await validateCargoToml(join(root, 'Cargo.toml')))?.message).toMatch(/missing/);
  });
});

describe('validatePackageSwift', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for a well-formed Package.swift', async () => {
    root = buildTree({ 'Package.swift': 'let package = Package(name: "x")' });
    expect(await validatePackageSwift(join(root, 'Package.swift'))).toBeUndefined();
  });

  it('warns when the file is missing', async () => {
    root = buildTree({});
    expect((await validatePackageSwift(join(root, 'Package.swift')))?.message).toMatch(/not found/);
  });

  it('warns when malformed', async () => {
    root = buildTree({ 'Package.swift': 'not swift' });
    expect((await validatePackageSwift(join(root, 'Package.swift')))?.message).toMatch(/malformed/);
  });
});

describe('validatePodfile', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for a well-formed Podfile', async () => {
    root = buildTree({ Podfile: "platform :ios, '13.0'\n" });
    expect(await validatePodfile(join(root, 'Podfile'))).toBeUndefined();
  });

  it('warns when the file is missing', async () => {
    root = buildTree({});
    expect((await validatePodfile(join(root, 'Podfile')))?.message).toMatch(/not found/);
  });

  it('warns when malformed', async () => {
    root = buildTree({ Podfile: 'nonsense\n' });
    expect((await validatePodfile(join(root, 'Podfile')))?.message).toMatch(/malformed/);
  });
});

describe('validateXcodeproj', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes when project.pbxproj is present', async () => {
    root = buildTree({ 'App.xcodeproj': { 'project.pbxproj': '' } });
    expect(await validateXcodeproj(join(root, 'App.xcodeproj'))).toBeUndefined();
  });

  it('warns when project.pbxproj is missing', async () => {
    root = buildTree({ 'App.xcodeproj': null });
    expect((await validateXcodeproj(join(root, 'App.xcodeproj')))?.message).toMatch(
      /project.pbxproj/,
    );
  });
});
