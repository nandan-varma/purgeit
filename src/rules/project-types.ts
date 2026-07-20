import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectTypeDetector } from '../types.js';
import { globToRegExp } from './gate-context.js';

function hasFile(dir: string, name: string): boolean {
  return existsSync(join(dir, name));
}

function hasAnyFile(dir: string, names: readonly string[]): boolean {
  return names.some((name) => hasFile(dir, name));
}

/** Returns the name of the first top-level entry matching `pattern`, or undefined. */
export function findTopLevelMatchName(
  dir: string,
  pattern: string,
  wantDir: boolean,
): string | undefined {
  const re = globToRegExp(pattern);
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  return entries.find((entry) => re.test(entry.name) && entry.isDirectory() === wantDir)?.name;
}

function hasTopLevelMatch(dir: string, pattern: string, wantDir: boolean): boolean {
  return findTopLevelMatchName(dir, pattern, wantDir) !== undefined;
}

/** Ports CLEANUP.sh's `detect_project()` — labels only, purely for display. */
export const PROJECT_TYPE_DETECTORS: readonly ProjectTypeDetector[] = [
  {
    id: 'next',
    label: 'next',
    detect: (dir) => hasAnyFile(dir, ['next.config.js', 'next.config.ts', 'next.config.mjs']),
  },
  { id: 'node', label: 'node', detect: (dir) => hasFile(dir, 'package.json') },
  {
    id: 'react-native',
    label: 'react-native',
    detect: (dir) =>
      hasFile(dir, 'ios/Podfile') ||
      hasFile(dir, 'android/build.gradle') ||
      hasFile(dir, 'android/settings.gradle'),
  },
  { id: 'tauri', label: 'tauri', detect: (dir) => hasFile(dir, 'src-tauri/Cargo.toml') },
  { id: 'rust', label: 'rust', detect: (dir) => hasFile(dir, 'Cargo.toml') },
  {
    id: 'python',
    label: 'python',
    detect: (dir) => hasAnyFile(dir, ['requirements.txt', 'pyproject.toml', 'setup.py']),
  },
  { id: 'spm', label: 'spm', detect: (dir) => hasFile(dir, 'Package.swift') },
  { id: 'xcode', label: 'xcode', detect: (dir) => hasTopLevelMatch(dir, '*.xcodeproj', true) },
  {
    id: 'dotnet',
    label: 'dotnet',
    detect: (dir) =>
      hasTopLevelMatch(dir, '*.csproj', false) || hasTopLevelMatch(dir, '*.sln', false),
  },
  { id: 'cmake', label: 'cmake', detect: (dir) => hasFile(dir, 'CMakeLists.txt') },
];

/**
 * Returns display labels for a project directory, in CLEANUP.sh's original
 * priority order. `next` and `node` are mutually exclusive (Next.js implies
 * Node, so showing both would be redundant) — every other type is additive.
 * `extraDetectors` (from user config) are appended, in the order given, after
 * the built-in labels.
 */
export function detectProjectTypes(
  dir: string,
  extraDetectors: readonly ProjectTypeDetector[] = [],
): string[] {
  const flags = new Map(PROJECT_TYPE_DETECTORS.map((d) => [d.id, d.detect(dir)] as const));
  const labels: string[] = [];

  if (flags.get('next')) {
    labels.push('next');
  } else if (flags.get('node')) {
    labels.push('node');
  }
  for (const id of ['react-native', 'tauri', 'rust', 'python', 'spm', 'xcode', 'dotnet', 'cmake']) {
    if (flags.get(id)) labels.push(id);
  }

  for (const detector of extraDetectors) {
    if (detector.detect(dir)) labels.push(detector.label);
  }

  return labels;
}
