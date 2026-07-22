/** Sync file-system probes scoped to a gated candidate's parent directory. */
export interface GateContext {
  readonly path: string;
  readonly parent: string;
  /** True if `parent/name` exists. */
  siblingFile(name: string): boolean;
  /** True if any entry directly inside `parent` matches the glob (`*`/`?` wildcards). */
  siblingGlob(pattern: string): boolean;
  /** True if `parent/name` exists and its contents match `pattern`. */
  siblingGrep(name: string, pattern: RegExp): boolean;
}

/** Synchronous predicate deciding whether a gated candidate is really generated output. */
export type Gate = (ctx: GateContext) => boolean;

export interface AlwaysSafeRule {
  readonly kind: 'always-safe';
  readonly name: string;
}

export interface GatedRule {
  readonly kind: 'gated';
  readonly name: string;
  readonly gate: Gate;
  readonly description?: string;
}

export type ArtifactRule = AlwaysSafeRule | GatedRule;

export interface ProjectTypeDetector {
  readonly id: string;
  readonly label: string;
  detect(projectDir: string): Promise<boolean> | boolean;
}

export interface ValidationWarning {
  readonly file: string;
  readonly message: string;
}

export type Validator = (projectDir: string) => ValidationWarning | undefined;

export interface ResolvedRuleSet {
  readonly alwaysSafe: ReadonlySet<string>;
  readonly gated: ReadonlyMap<string, Gate>;
  readonly pruneMeta: ReadonlySet<string>;
  readonly skipDirs: ReadonlySet<string>;
  readonly targets: ReadonlyMap<string, readonly string[]>;
}
