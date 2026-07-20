import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pLimit from 'p-limit';
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
  /** Max concurrent size computations. Default 8. */
  readonly concurrency?: number;
  /** Never descend more than this many levels below each scanned root. Default: unlimited. */
  readonly maxDepth?: number | undefined;
}

/** Minimal async pull-based queue bridging concurrent producers into a single async generator. */
class AsyncQueue<T> {
  private readonly buffered: T[] = [];
  private readonly waiting: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    /* v8 ignore next -- defensive guard: scan() never pushes after closing the queue */
    if (this.closed) return;
    const resolver = this.waiting.shift();
    if (resolver) {
      resolver({ value: item, done: false });
    } else {
      this.buffered.push(item);
    }
  }

  close(): void {
    /* v8 ignore next -- defensive guard: scan() only ever calls close() once */
    if (this.closed) return;
    this.closed = true;
    // scan() always pushes a final 'done' item immediately before closing,
    // which drains any pending waiter itself, so this loop never actually
    // finds one still waiting in this file's usage — kept for the class's
    // general correctness rather than narrowed to the one call site.
    /* v8 ignore next 3 -- unreachable in this file's usage, see comment above */
    for (const resolver of this.waiting.splice(0)) {
      resolver({ value: undefined as unknown as T, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      if (this.buffered.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: length > 0 was just checked
        yield this.buffered.shift()!;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiting.push(resolve);
      });
      /* v8 ignore next -- close() never actually resolves a pending waiter in this file's usage, see close()'s comment */
      if (result.done) return;
      yield result.value;
    }
  }
}

interface ProjectInfo {
  readonly name: string;
  readonly path: string;
  readonly label: string;
  readonly warnings: readonly ValidationWarning[];
}

async function listProjects(
  root: string,
  ruleSet: ResolvedRuleSet,
  targetProject: string | undefined,
): Promise<ProjectInfo[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects: ProjectInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const name = entry.name;
    if (ruleSet.pruneMeta.has(name) || ruleSet.skipDirs.has(name)) continue;
    if (targetProject !== undefined && name !== targetProject) continue;

    const path = join(root, name);
    const labels = detectProjectTypes(path);
    projects.push({
      name,
      path,
      label: labels.join(','),
      warnings: collectValidatorWarnings(path, labels),
    });
  }
  return projects;
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
        for await (const match of walk(root, ruleSet, { signal, maxDepth: opts.maxDepth })) {
          if (signal?.aborted) break;
          handleMatch(root, match);
        }
        return;
      }

      const projects = await listProjects(root, ruleSet, opts.targetProject);
      for (const project of projects) {
        if (signal?.aborted) break;
        queue.push({ type: 'project-start', project: project.name, label: project.label });
        for (const warning of project.warnings) {
          queue.push({ type: 'warning', warning });
        }
        for await (const match of walk(project.path, ruleSet, {
          signal,
          maxDepth: opts.maxDepth,
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
