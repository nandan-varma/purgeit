import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ValidationWarning } from '../types.js';

/** Warn-only manifest checks, ported from CLEANUP.sh's `validate_*` functions. */

export function validatePackageJson(file: string): ValidationWarning | undefined {
  if (!existsSync(file)) {
    return { file, message: 'package.json not found' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { file, message: 'package.json is invalid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || !('name' in parsed)) {
    return { file, message: "package.json is missing 'name' field" };
  }
  return undefined;
}

export function validateNextConfig(dir: string): ValidationWarning | undefined {
  const candidates = ['next.config.js', 'next.config.ts', 'next.config.mjs'].map((name) =>
    join(dir, name),
  );
  const cfg = candidates.find((path) => existsSync(path));
  if (!cfg) {
    return { file: dir, message: 'Next.js project but no next.config.{js,ts,mjs} found' };
  }
  if (statSync(cfg).size === 0) {
    return { file: cfg, message: 'next.config is empty' };
  }
  return undefined;
}

export function validateCargoToml(file: string): ValidationWarning | undefined {
  if (!existsSync(file)) {
    return { file, message: 'Cargo.toml not found' };
  }
  const raw = readFileSync(file, 'utf8');
  if (!/^\[package\]|^\[workspace\]/m.test(raw)) {
    return { file, message: 'Cargo.toml missing [package] or [workspace]' };
  }
  return undefined;
}

export function validatePackageSwift(file: string): ValidationWarning | undefined {
  if (!existsSync(file)) {
    return { file, message: 'Package.swift not found' };
  }
  const raw = readFileSync(file, 'utf8');
  if (!raw.includes('Package(')) {
    return { file, message: 'Package.swift looks malformed' };
  }
  return undefined;
}

export function validatePodfile(file: string): ValidationWarning | undefined {
  if (!existsSync(file)) {
    return { file, message: 'Podfile not found' };
  }
  const raw = readFileSync(file, 'utf8');
  if (!/^(platform|target|pod )/m.test(raw)) {
    return { file, message: 'Podfile looks malformed' };
  }
  return undefined;
}

export function validateXcodeproj(xcodeprojDir: string): ValidationWarning | undefined {
  const pbxproj = join(xcodeprojDir, 'project.pbxproj');
  if (!existsSync(pbxproj)) {
    return { file: xcodeprojDir, message: 'Malformed .xcodeproj — missing project.pbxproj' };
  }
  return undefined;
}
