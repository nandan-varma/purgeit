import { access, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ValidationWarning } from '../types.js';

/** Warn-only manifest checks, ported from CLEANUP.sh's `validate_*` functions. */

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function validatePackageJson(file: string): Promise<ValidationWarning | undefined> {
  if (!(await pathExists(file))) {
    return { file, message: 'package.json not found' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return { file, message: 'package.json is invalid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || !('name' in parsed)) {
    return { file, message: "package.json is missing 'name' field" };
  }
  return undefined;
}

export async function validateNextConfig(dir: string): Promise<ValidationWarning | undefined> {
  const candidates = ['next.config.js', 'next.config.ts', 'next.config.mjs'].map((name) =>
    join(dir, name),
  );
  const checks = await Promise.all(
    candidates.map(async (path) => ((await pathExists(path)) ? path : undefined)),
  );
  const cfg = checks.find(Boolean);
  if (!cfg) {
    return { file: dir, message: 'Next.js project but no next.config.{js,ts,mjs} found' };
  }
  if ((await stat(cfg)).size === 0) {
    return { file: cfg, message: 'next.config is empty' };
  }
  return undefined;
}

export async function validateCargoToml(file: string): Promise<ValidationWarning | undefined> {
  if (!(await pathExists(file))) {
    return { file, message: 'Cargo.toml not found' };
  }
  const raw = await readFile(file, 'utf8');
  if (!/^\[package\]|^\[workspace\]/m.test(raw)) {
    return { file, message: 'Cargo.toml missing [package] or [workspace]' };
  }
  return undefined;
}

export async function validatePackageSwift(file: string): Promise<ValidationWarning | undefined> {
  if (!(await pathExists(file))) {
    return { file, message: 'Package.swift not found' };
  }
  const raw = await readFile(file, 'utf8');
  if (!raw.includes('Package(')) {
    return { file, message: 'Package.swift looks malformed' };
  }
  return undefined;
}

export async function validatePodfile(file: string): Promise<ValidationWarning | undefined> {
  if (!(await pathExists(file))) {
    return { file, message: 'Podfile not found' };
  }
  const raw = await readFile(file, 'utf8');
  if (!/^(platform|target|pod )/m.test(raw)) {
    return { file, message: 'Podfile looks malformed' };
  }
  return undefined;
}

export async function validateXcodeproj(
  xcodeprojDir: string,
): Promise<ValidationWarning | undefined> {
  const pbxproj = join(xcodeprojDir, 'project.pbxproj');
  if (!(await pathExists(pbxproj))) {
    return { file: xcodeprojDir, message: 'Malformed .xcodeproj — missing project.pbxproj' };
  }
  return undefined;
}
