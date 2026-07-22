import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import pLimit from 'p-limit';
import { createGateContext } from '../rules/gate-context.js';
import { detectProjectTypes, findTopLevelMatchName } from '../rules/project-types.js';
import {
  validateCargoToml,
  validateNextConfig,
  validatePackageJson,
  validatePackageSwift,
  validatePodfile,
  validateXcodeproj,
} from '../rules/validators.js';
import type { ResolvedRuleSet, ValidationWarning } from '../types.js';
import { AsyncQueue } from './async-queue.js';
import { computeSize } from './size.js';
import type { WalkMatch } from './walk.js';
import { walk } from './walk.js';

export interface ScanEntry {
  readonly path: string;
  readonly project: string;
  readonly kind: 'always-safe' | 'gated';
  readonly ruleName: string;
  size: number | null;
}

export type ScanEvent =
  | { readonly type: 'project-start'; readonly project: string; readonly label: string }
  | { readonly type: 'project-skip'; readonly project: string }
  | { readonly type: 'found'; readonly entry: ScanEntry }
  | { readonly type: 'size'; readonly path: string; readonly bytes: number }
  | { readonly type: 'warning'; readonly warning: ValidationWarning }
  | { readonly type: 'done'; readonly totalBytes: number };

export interface ScanOptions {
  readonly signal?: AbortSignal | undefined;
  /** 'projects' (default) groups immediate children of root as projects, matching
   * CLEANUP.sh; 'flat' treats root as a single scan unit (closer to npkill). */
  readonly mode?: 'projects' | 'flat';
  readonly targetProject?: string | undefined;
  /** Max concurrent filesystem operations (directory reads + size computations), shared
   * across discovery and sizing so total in-flight work stays bounded. Default 8. */
  readonly concurrency?: number;
  /** Never descend more than this many levels below each scanned root. Default: unlimited. */
  readonly maxDepth?: number | undefined;
}

interface ProjectInfo {
  readonly name: string;
  readonly path: string;
  readonly label: string;
  readonly warnings: readonly ValidationWarning[];
}

interface TopLevelListing {
  readonly projects: ProjectInfo[];
  readonly matches: WalkMatch[];
}

/**
 * Lists `root`'s immediate children for 'projects' mode. A child whose
 * *name* is itself an always-safe/gated rule match (e.g. running purgeit
 * directly inside a single project, where `node_modules`/`dist`/`build`
 * shows up as an immediate child of the scanned root, not a project
 * directory) is reported directly as a match instead of being treated as a
 * project to recurse into — `walk()` only ever checks a directory's
 * *children* against the ruleset, never the root path it's handed, so
 * without this check that directory would be walked in full, surfacing
 * nested artifacts from deep inside it (e.g. nested `node_modules` under
 * `.pnpm`) as spurious top-level "duplicates" while wastefully traversing
 * a potentially huge tree.
 */
async function listProjects(
  root: string,
  ruleSet: ResolvedRuleSet,
  targetProject: string | undefined,
): Promise<TopLevelListing> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { projects: [], matches: [] };
  }

  const projects: ProjectInfo[] = [];
  const matches: WalkMatch[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const name = entry.name;
    if (ruleSet.pruneMeta.has(name) || ruleSet.skipDirs.has(name)) continue;
    if (targetProject !== undefined && name !== targetProject) continue;

    const path = join(root, name);

    if (ruleSet.alwaysSafe.has(name)) {
      matches.push({ path, kind: 'always-safe', ruleName: name });
      continue;
    }
    const gate = ruleSet.gated.get(name);
    if (gate !== undefined) {
      if (gate(createGateContext(path))) {
        matches.push({ path, kind: 'gated', ruleName: name });
      }
      continue;
    }

    const labels = detectProjectTypes(path);
    projects.push({
      name,
      path,
      label: labels.join(','),
      warnings: collectValidatorWarnings(path, labels),
    });
  }
  return { projects, matches };
}

function collectValidatorWarnings(
  projectPath: string,
  labels: readonly string[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const has = (label: string) => labels.includes(label);
  const push = (warning: ValidationWarning | undefined) => {
    if (warning) warnings.push(warning);
  };

  if (has('node') || has('next')) {
    push(validatePackageJson(join(projectPath, 'package.json')));
  }
  if (has('next')) {
    push(validateNextConfig(projectPath));
  }
  if (has('rust')) {
    push(validateCargoToml(join(projectPath, 'Cargo.toml')));
  }
  if (has('tauri')) {
    push(validateCargoToml(join(projectPath, 'src-tauri', 'Cargo.toml')));
  }
  if (has('spm')) {
    push(validatePackageSwift(join(projectPath, 'Package.swift')));
  }
  if (has('xcode')) {
    const xcodeprojName = findTopLevelMatchName(projectPath, '*.xcodeproj', true);
    if (xcodeprojName !== undefined) {
      push(validateXcodeproj(join(projectPath, xcodeprojName)));
    }
  }
  if (has('react-native')) {
    push(validatePodfile(join(projectPath, 'ios', 'Podfile')));
  }

  return warnings;
}

/**
 * Scans for regenerable artifact directories under `root`, streaming events
 * progressively: a `found` event fires as soon as a match is discovered
 * (size initially null), followed later by an independent `size` event once
 * its byte count finishes computing — discovery is never blocked on sizing.
 */
export async function* scan(
  root: string,
  ruleSet: ResolvedRuleSet,
  opts: ScanOptions = {},
): AsyncGenerator<ScanEvent> {
  const mode = opts.mode ?? 'projects';
  const signal = opts.signal;
  const limit = pLimit(opts.concurrency ?? 8);
  const queue = new AsyncQueue<ScanEvent>();

  let totalBytes = 0;
  let pendingSizes = 0;
  let discoveryDone = false;

  function maybeFinish(): void {
    if (discoveryDone && pendingSizes === 0) {
      queue.push({ type: 'done', totalBytes });
      queue.close();
    }
  }

  function handleMatch(project: string, match: WalkMatch): void {
    const entry: ScanEntry = {
      path: match.path,
      project,
      kind: match.kind,
      ruleName: match.ruleName,
      size: null,
    };
    queue.push({ type: 'found', entry });
    pendingSizes++;
    void limit(async () => {
      if (signal?.aborted) {
        pendingSizes--;
        maybeFinish();
        return;
      }
      const bytes = await computeSize(match.path);
      entry.size = bytes;
      totalBytes += bytes;
      queue.push({ type: 'size', path: match.path, bytes });
      pendingSizes--;
      maybeFinish();
    });
  }

  async function runDiscovery(): Promise<void> {
    try {
      if (mode === 'flat') {
        for await (const match of walk(root, ruleSet, { signal, maxDepth: opts.maxDepth, limit })) {
          if (signal?.aborted) break;
          handleMatch(root, match);
        }
        return;
      }

      const { projects, matches } = await listProjects(root, ruleSet, opts.targetProject);
      const rootLabel = basename(root);
      for (const match of matches) {
        if (signal?.aborted) break;
        handleMatch(rootLabel, match);
      }

      for (const project of projects) {
        if (signal?.aborted) break;
        queue.push({ type: 'project-start', project: project.name, label: project.label });
        for (const warning of project.warnings) {
          queue.push({ type: 'warning', warning });
        }
        for await (const match of walk(project.path, ruleSet, {
          signal,
          maxDepth: opts.maxDepth,
          limit,
        })) {
          if (signal?.aborted) break;
          handleMatch(project.name, match);
        }
      }
    } finally {
      discoveryDone = true;
      maybeFinish();
    }
  }

  void runDiscovery();

  yield* queue;
}
