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

  it('passes for a valid package.json', () => {
    root = buildTree({ 'package.json': '{"name":"x"}' });
    expect(validatePackageJson(join(root, 'package.json'))).toBeUndefined();
  });

  it('warns when the file is missing', () => {
    root = buildTree({});
    expect(validatePackageJson(join(root, 'package.json'))?.message).toMatch(/not found/);
  });

  it('warns on invalid JSON', () => {
    root = buildTree({ 'package.json': '{not json' });
    expect(validatePackageJson(join(root, 'package.json'))?.message).toMatch(/invalid JSON/);
  });

  it("warns when 'name' is missing", () => {
    root = buildTree({ 'package.json': '{}' });
    expect(validatePackageJson(join(root, 'package.json'))?.message).toMatch(/name/);
  });
});

describe('validateNextConfig', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for a populated next.config.js', () => {
    root = buildTree({ 'next.config.js': 'module.exports = {}' });
    expect(validateNextConfig(root)).toBeUndefined();
  });

  it('accepts .ts and .mjs variants', () => {
    root = buildTree({ 'next.config.ts': 'export default {}' });
    expect(validateNextConfig(root)).toBeUndefined();
  });

  it('warns when no config file exists', () => {
    root = buildTree({});
    expect(validateNextConfig(root)?.message).toMatch(/no next.config/);
  });

  it('warns when the config file is empty', () => {
    root = buildTree({ 'next.config.mjs': '' });
    expect(validateNextConfig(root)?.message).toMatch(/empty/);
  });
});

describe('validateCargoToml', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for [package]', () => {
    root = buildTree({ 'Cargo.toml': '[package]\nname = "x"\n' });
    expect(validateCargoToml(join(root, 'Cargo.toml'))).toBeUndefined();
  });

  it('passes for [workspace]', () => {
    root = buildTree({ 'Cargo.toml': '[workspace]\nmembers = []\n' });
    expect(validateCargoToml(join(root, 'Cargo.toml'))).toBeUndefined();
  });

  it('warns when the file is missing', () => {
    root = buildTree({});
    expect(validateCargoToml(join(root, 'Cargo.toml'))?.message).toMatch(/not found/);
  });

  it('warns when neither section is present', () => {
    root = buildTree({ 'Cargo.toml': 'not a real manifest\n' });
    expect(validateCargoToml(join(root, 'Cargo.toml'))?.message).toMatch(/missing/);
  });
});

describe('validatePackageSwift', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for a well-formed Package.swift', () => {
    root = buildTree({ 'Package.swift': 'let package = Package(name: "x")' });
    expect(validatePackageSwift(join(root, 'Package.swift'))).toBeUndefined();
  });

  it('warns when the file is missing', () => {
    root = buildTree({});
    expect(validatePackageSwift(join(root, 'Package.swift'))?.message).toMatch(/not found/);
  });

  it('warns when malformed', () => {
    root = buildTree({ 'Package.swift': 'not swift' });
    expect(validatePackageSwift(join(root, 'Package.swift'))?.message).toMatch(/malformed/);
  });
});

describe('validatePodfile', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes for a well-formed Podfile', () => {
    root = buildTree({ Podfile: "platform :ios, '13.0'\n" });
    expect(validatePodfile(join(root, 'Podfile'))).toBeUndefined();
  });

  it('warns when the file is missing', () => {
    root = buildTree({});
    expect(validatePodfile(join(root, 'Podfile'))?.message).toMatch(/not found/);
  });

  it('warns when malformed', () => {
    root = buildTree({ Podfile: 'nonsense\n' });
    expect(validatePodfile(join(root, 'Podfile'))?.message).toMatch(/malformed/);
  });
});

describe('validateXcodeproj', () => {
  let root: string;
  afterEach(() => cleanupTree(root));

  it('passes when project.pbxproj is present', () => {
    root = buildTree({ 'App.xcodeproj': { 'project.pbxproj': '' } });
    expect(validateXcodeproj(join(root, 'App.xcodeproj'))).toBeUndefined();
  });

  it('warns when project.pbxproj is missing', () => {
    root = buildTree({ 'App.xcodeproj': null });
    expect(validateXcodeproj(join(root, 'App.xcodeproj'))?.message).toMatch(/project.pbxproj/);
  });
});
